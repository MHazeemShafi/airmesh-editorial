import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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

async function getPreference(token) {
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return null;
  }

  const tokenHash = createHash('sha256')
    .update(token)
    .digest('hex');

  const { data, error } = await supabase
    .from('air_alert_preferences')
    .select(`
      subscriber_id,
      profile,
      enabled,
      pollutants,
      thresholds,
      frequency
    `)
    .eq('management_token_hash', tokenHash)
    .gt(
      'management_token_expires_at',
      new Date().toISOString()
    )
    .maybeSingle();

  if (error) throw error;

  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const token = String(req.query?.token || '');

      const preference = await getPreference(token);

      if (!preference) {
        return res.status(401).json({
          error:
            'This settings link is invalid or expired. Request a new one.'
        });
      }

      return res.status(200).json({
        profile: preference.profile,
        enabled: preference.enabled,
        pollutants: preference.pollutants || [],
        thresholds: preference.thresholds || {},
        frequency: preference.frequency || 'important'
      });
    }

    if (req.method === 'POST') {
      const token = String(req.body?.token || '');

      const preference = await getPreference(token);

      if (!preference) {
        return res.status(401).json({
          error:
            'This settings link is invalid or expired. Request a new one.'
        });
      }

      const body = req.body || {};

      const profile = [
        'general',
        'respiratory_sensitive',
        'custom'
      ].includes(body.profile)
        ? body.profile
        : 'respiratory_sensitive';

      const pollutants = Array.isArray(body.pollutants)
        ? [...new Set(
            body.pollutants.filter(p =>
              Object.hasOwn(ALLOWED_UNITS, p)
            )
          )]
        : [];

      const thresholds = {};

      for (const pollutant of pollutants) {
        const item = body.thresholds?.[pollutant];

        if (
          !item ||
          !Number.isFinite(Number(item.value)) ||
          Number(item.value) <= 0 ||
          Number(item.value) > 100000 ||
          item.unit !== ALLOWED_UNITS[pollutant]
        ) {
          return res.status(400).json({
            error:
              `Enter a valid threshold for ${pollutant.toUpperCase()} in ${ALLOWED_UNITS[pollutant]}.`
          });
        }

        thresholds[pollutant] = {
          value: Number(item.value),
          unit: ALLOWED_UNITS[pollutant]
        };
      }

      const { error: updateError } = await supabase
        .from('air_alert_preferences')
        .update({
          profile,
          enabled: body.enabled === true,
          pollutants,
          thresholds,
          frequency: 'important',
          updated_at: new Date().toISOString()
        })
        .eq('subscriber_id', preference.subscriber_id);

      if (updateError) throw updateError;

      return res.status(200).json({
        message:
          'Your AirMesh notification preferences have been saved.'
      });
    }

    return res.status(405).json({
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error(
      'AirMesh manage settings error:',
      error
    );

    return res.status(500).json({
      error:
        'Could not process alert settings right now.'
    });
  }
}