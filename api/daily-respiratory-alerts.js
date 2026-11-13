
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoEmail } from './_lib/send-brevo.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


const MAX_READING_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const ALLOWED_UNITS = {
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  o3: 'µg/m³',
  no2: 'ppb',
  so2: 'ppb',
  co: 'ppb',
  no: 'ppb',
  nox: 'ppb'
};

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function authenticateCron(req) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || '';

  if (!secret || !authorization.startsWith('Bearer ')) {
    return false;
  }

  const supplied = Buffer.from(
    authorization.slice(7)
  );

  const expected = Buffer.from(secret);

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatMeasurementTime(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  }).format(new Date(timestamp));
}

function getCurrentReadings(payload) {
  if (
    payload?.dataStatus !== 'available' ||
    !Array.isArray(payload.readings)
  ) {
    throw new Error('AirMesh readings are unavailable.');
  }

  const now = Date.now();
  const currentReadings = {};

  for (const reading of payload.readings) {
    const parameter = String(
      reading?.parameter || ''
    ).toLowerCase();

    if (!Object.hasOwn(ALLOWED_UNITS, parameter)) {
      continue;
    }

    const value = Number(reading.value);
    const unit = reading.unit;
    const timestamp = Date.parse(reading.time);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      unit !== ALLOWED_UNITS[parameter] ||
      !Number.isFinite(timestamp)
    ) {
      continue;
    }

    const age = now - timestamp;

    if (
      age > MAX_READING_AGE_MS ||
      age < -FUTURE_TOLERANCE_MS
    ) {
      continue;
    }

    // Keep the newest valid measurement for each pollutant.
    if (
      !currentReadings[parameter] ||
      timestamp > currentReadings[parameter].timestamp
    ) {
      currentReadings[parameter] = {
        value,
        unit,
        timestamp
      };
    }
  }

  return currentReadings;
}

function findExceededThresholds(preference, readings) {
  const pollutants = Array.isArray(preference.pollutants)
    ? preference.pollutants
    : [];

  const thresholds = preference.thresholds || {};
  const exceeded = [];

  for (const pollutant of pollutants) {
    if (!Object.hasOwn(ALLOWED_UNITS, pollutant)) {
      continue;
    }

    const threshold = thresholds[pollutant];
    const reading = readings[pollutant];

    if (!threshold || !reading) {
      continue;
    }

    const thresholdValue = Number(threshold.value);

    if (
      !Number.isFinite(thresholdValue) ||
      thresholdValue <= 0 ||
      threshold.unit !== ALLOWED_UNITS[pollutant]
    ) {
      continue;
    }

    if (reading.value > thresholdValue) {
      exceeded.push({
        pollutant,
        value: reading.value,
        threshold: thresholdValue,
        unit: reading.unit,
        timestamp: reading.timestamp
      });
    }
  }

  return exceeded;
}

function buildEmailHtml(exceeded) {
  const rows = exceeded.map(item => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #e5ebe5">
        <strong>${escapeHtml(item.pollutant.toUpperCase())}</strong>
      </td>
      <td style="padding:12px;border-bottom:1px solid #e5ebe5">
        ${escapeHtml(item.value)} ${escapeHtml(item.unit)}
      </td>
      <td style="padding:12px;border-bottom:1px solid #e5ebe5">
        ${escapeHtml(item.threshold)} ${escapeHtml(item.unit)}
      </td>
      <td style="padding:12px;border-bottom:1px solid #e5ebe5">
        ${escapeHtml(formatMeasurementTime(item.timestamp))}
      </td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#26382b;line-height:1.6">
      <div style="padding:24px;background:#203d2a;color:white;border-radius:10px 10px 0 0">
        <h1 style="margin:0;font-size:23px">AirMesh</h1>
        <p style="margin:5px 0 0;color:#c7dfca">Daily air-quality alert</p>
      </div>

      <div style="padding:24px;border:1px solid #e1e9e1;border-top:0">
        <h2 style="font-size:19px">A reading went above your limit</h2>

        <p>
          These recent readings from
          <strong>Kadri, Mangaluru - KSPCB</strong>
          were above one or more limits in your alert settings.
        </p>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f0f5ef;text-align:left">
                <th style="padding:12px">Pollutant</th>
                <th style="padding:12px">Measured</th>
                <th style="padding:12px">Your threshold</th>
                <th style="padding:12px">Measurement time</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>

        <p style="margin-top:22px;font-size:13px;color:#647267">
          These alerts compare station readings with the limits you selected. They are not official CPCB AQI values or medical advice.
        </p>

        <p style="font-size:13px;color:#647267">
          These readings come from the Kadri station. Air quality may be different in your neighbourhood or indoors.
        </p>

        <p style="margin-top:24px">
          <a href="${escapeHtml(process.env.APP_URL)}"
             style="display:inline-block;padding:11px 18px;background:#315b3d;color:white;text-decoration:none;border-radius:6px">
            View AirMesh readings
          </a>
        </p>

        <p style="font-size:12px;color:#849087">
          AirMesh | Air quality readings from Kadri, Mangaluru
        </p>
      </div>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  if (!authenticateCron(req)) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  try {
    const appUrl = process.env.APP_URL;

    if (
      !appUrl ||
      !process.env.BREVO_API_KEY ||
      !process.env.BREVO_FROM_EMAIL ||
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(
        'AirMesh notification environment variables are incomplete.'
      );
    }

    // Fetch the deployed AirMesh API, not frontend or stale cached data.
    const readingsResponse = await fetch(
      `${appUrl.replace(/\/$/, '')}/api/air-quality`,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );

    if (!readingsResponse.ok) {
      throw new Error(
        `Air-quality API returned HTTP ${readingsResponse.status}.`
      );
    }

    const payload = await readingsResponse.json();
    const readings = getCurrentReadings(payload);

    if (Object.keys(readings).length === 0) {
      return res.status(200).json({
        message: 'No fresh supported pollutant readings. No emails sent.',
        sent: 0,
        skipped: 0,
        failed: 0
      });
    }

    const today = getIndiaDate();

    const { data: preferences, error: preferencesError } =
      await supabase
        .from('air_alert_preferences')
        .select(`
          subscriber_id,
          profile,
          enabled,
          pollutants,
          thresholds,
          frequency,
          last_notification_date
        `)
        .eq('enabled', true);

    if (preferencesError) throw preferencesError;

    if (!preferences || preferences.length === 0) {
      return res.status(200).json({
        message: 'No enabled notification preferences.',
        sent: 0,
        skipped: 0,
        failed: 0
      });
    }

    const subscriberIds = preferences.map(
      preference => preference.subscriber_id
    );

    const { data: subscribers, error: subscribersError } =
      await supabase
        .from('email_subscribers')
        .select('id, email')
        .in('id', subscriberIds)
        .eq('is_verified', true)
        .eq('is_active', true);

    if (subscribersError) throw subscribersError;

    const subscriberMap = new Map(
      (subscribers || []).map(subscriber => [
        subscriber.id,
        subscriber
      ])
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const preference of preferences) {
      const subscriber = subscriberMap.get(
        preference.subscriber_id
      );

      if (
        !subscriber ||
        preference.last_notification_date === today
      ) {
        skipped++;
        continue;
      }

      const exceeded = findExceededThresholds(
        preference,
        readings
      );

      if (exceeded.length === 0) {
        skipped++;
        continue;
      }

      try {
        await sendBrevoEmail({
          to: subscriber.email,
          subject: 'AirMesh: A reading went above your alert limit',
          htmlContent: buildEmailHtml(exceeded)
        });

        // Record the date only after Brevo accepts the email.
        const { error: updateError } = await supabase
          .from('air_alert_preferences')
          .update({
            last_notification_date: today,
            updated_at: new Date().toISOString()
          })
          .eq('subscriber_id', preference.subscriber_id);

        if (updateError) throw updateError;

        await supabase
          .from('email_subscribers')
          .update({
            last_alert_sent_at: new Date().toISOString()
          })
          .eq('id', subscriber.id);

        sent++;
      } catch (emailOrUpdateError) {
        failed++;

        console.error(
          'AirMesh notification failed for subscriber:',
          subscriber.id,
          emailOrUpdateError
        );
      }
    }

    return res.status(200).json({
      message: 'Daily AirMesh notification check completed.',
      date: today,
      sent,
      skipped,
      failed
    });

  } catch (error) {
    console.error(
      'Daily AirMesh notification error:',
      error
    );

    return res.status(500).json({
      error: 'The daily notification check could not be completed.'
    });
  }
}
