import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoEmail } from './_lib/send-brevo.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


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

const ALLOWED_POLLUTANTS = Object.keys(ALLOWED_UNITS);

const DEFAULT_THRESHOLDS = {
  pm25: {
    value: 15,
    unit: 'µg/m³'
  }
};

function cleanPreferences(input = {}) {
  const profile = [
    'general',
    'respiratory_sensitive',
    'custom'
  ].includes(input.profile)
    ? input.profile
    : 'respiratory_sensitive';

  const pollutants = Array.isArray(input.pollutants)
    ? [...new Set(
        input.pollutants.filter(p =>
          ALLOWED_POLLUTANTS.includes(p)
        )
      )]
    : ['pm25'];

  const thresholds = {};

  for (const pollutant of pollutants) {
    const threshold =
      input.thresholds?.[pollutant] ||
      (pollutant === 'pm25'
        ? DEFAULT_THRESHOLDS.pm25
        : null);

    if (
      !threshold ||
      !Number.isFinite(Number(threshold.value)) ||
      Number(threshold.value) <= 0 ||
      Number(threshold.value) > 100000 ||
      threshold.unit !== ALLOWED_UNITS[pollutant]
    ) {
      return {
        error: `Enter a valid threshold for ${pollutant.toUpperCase()} in ${ALLOWED_UNITS[pollutant]}.`
      };
    }

    thresholds[pollutant] = {
      value: Number(threshold.value),
      unit: ALLOWED_UNITS[pollutant]
    };
  }

  return {
    profile,
    enabled: input.enabled === true,
    pollutants,
    thresholds
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return res.status(400).json({
        error: 'Enter a valid email address.'
      });
    }

    const preferences = cleanPreferences(
      req.body?.preferences
    );

    if (preferences.error) {
      return res.status(400).json({
        error: preferences.error
      });
    }

    const { data: existing, error: lookupError } =
      await supabase
        .from('email_subscribers')
        .select('id,is_verified,is_active')
        .ilike('email', email)
        .maybeSingle();

    if (lookupError) throw lookupError;

    if (existing?.is_verified && existing?.is_active) {
      return res.status(409).json({
        alreadySubscribed: true,
        error:
          'This email is already subscribed. Request a secure settings link to change your preferences.'
      });
    }

    const token = randomBytes(32).toString('hex');

    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    const expiry = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    let subscriberId;

    if (existing) {
      const { data, error } = await supabase
        .from('email_subscribers')
        .update({
          email,
          is_active: true,
          is_verified: false,
          verification_token_hash: tokenHash,
          verification_expires_at: expiry
        })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error) throw error;

      subscriberId = data.id;
    } else {
      const { data, error } = await supabase
        .from('email_subscribers')
        .insert({
          email,
          is_active: true,
          is_verified: false,
          verification_token_hash: tokenHash,
          verification_expires_at: expiry
        })
        .select('id')
        .single();

      if (error) throw error;

      subscriberId = data.id;
    }

    const { error: preferenceError } = await supabase
      .from('air_alert_preferences')
      .upsert({
        subscriber_id: subscriberId,
        profile: preferences.profile,
        enabled: preferences.enabled,
        pollutants: preferences.pollutants,
        thresholds: preferences.thresholds,
        frequency: 'important',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'subscriber_id'
      });

    if (preferenceError) throw preferenceError;

    if (!process.env.APP_URL) {
      throw new Error('APP_URL is not configured.');
    }

    const verificationUrl =
      `${process.env.APP_URL.replace(/\/$/, '')}` +
      `/api/verify-subscription?token=${token}`;

    await sendBrevoEmail({
      to: email,
      subject: 'Confirm your AirMesh email address',
      htmlContent: `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light">
            <title>Verify your AirMesh email</title>
          </head>
          <body style="margin:0;padding:0;background:#eef4f7;font-family:Arial,Helvetica,sans-serif;color:#172b3a;">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
              Confirm your email address to start AirMesh alerts.
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef4f7;padding:32px 12px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
                    <tr>
                      <td style="padding:28px 34px;background:#102d46;">
                        <div style="font-size:12px;letter-spacing:3px;font-weight:700;color:#9bd7e8;">A I R M E S H</div>
                        <div style="margin-top:7px;font-size:13px;color:#d4e6ef;">Air quality readings for Mangaluru.</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:38px 34px 24px;">
                        <div style="display:inline-block;padding:7px 11px;border-radius:20px;background:#e8f5f8;color:#17617a;font-size:11px;font-weight:700;letter-spacing:1px;">
                          EMAIL VERIFICATION
                        </div>
                        <h1 style="margin:20px 0 12px;font-size:27px;line-height:1.25;color:#102d46;">
                          Confirm your email address.
                        </h1>
                        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#526574;">
                          You signed up for AirMesh email alerts. Confirm this email address to activate the alerts and settings you selected.
                        </p>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0;">
                          <tr>
                            <td align="center" bgcolor="#147b9b" style="border-radius:8px;">
                              <a href="${verificationUrl}" target="_blank" style="display:inline-block;padding:15px 25px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                                Confirm email address
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#687b89;">
                          Button not working? Copy this link into your browser:
                        </p>
                        <p style="margin:0 0 26px;word-break:break-all;font-size:12px;line-height:1.6;">
                          <a href="${verificationUrl}" style="color:#147b9b;">${verificationUrl}</a>
                        </p>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f7f9;border-left:3px solid #58a9c0;border-radius:6px;">
                          <tr>
                            <td style="padding:15px 17px;">
                              <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#17394d;">About this link</p>
                              <p style="margin:0;font-size:12px;line-height:1.6;color:#607482;">
                                This link expires in 24 hours and can only be used to confirm this subscription. If you did not sign up for AirMesh alerts, you can ignore this email.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:22px 34px;background:#f7fafb;border-top:1px solid #e6eef1;">
                        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1px;color:#29495b;">A I R M E S H</p>
                        <p style="margin:0;font-size:11px;line-height:1.6;color:#81919b;">
                          Air-quality readings from the Kadri station in Mangaluru.<br>
                          This is an automated email. Please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:18px 0 0;font-size:10px;color:#91a0a8;">© AirMesh</p>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      textContent: `AIRMESH
Air quality readings for Mangaluru.

Confirm your email address to start AirMesh alerts.

Open this link:
${verificationUrl}

This link expires in 24 hours. If you did not sign up for AirMesh alerts, ignore this email.`
    });

    return res.status(200).json({
      message:
        'Check your inbox for a confirmation link. Your alert settings will start after you verify your email.'
    });

  } catch (error) {
    console.error('AirMesh subscribe error:', error);

    return res.status(500).json({
      error:
        'Could not start your subscription. Please try again later.'
    });
  }
}
