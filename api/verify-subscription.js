import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function createPage(title, message) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title} · AirMesh</title>

        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #101914;
            color: #e7efe7;
            font-family: Arial, sans-serif;
          }

          main {
            max-width: 520px;
            margin: 24px;
            padding: 32px;
            background: #19261e;
            border: 1px solid #314438;
            border-radius: 16px;
          }

          h1 {
            color: #a5d7aa;
          }

          p {
            line-height: 1.7;
            color: #c3d0c5;
          }

          a {
            color: #a5d7aa;
          }
        </style>
      </head>

      <body>
        <main>
          <h1>${title}</h1>
          <p>${message}</p>
          <p>
            <a href="${process.env.APP_URL || '/'}">
              Return to AirMesh
            </a>
          </p>
        </main>
      </body>
    </html>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const token = String(req.query?.token || '');

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).send(
        createPage(
          'Invalid link',
          'This verification link is invalid.'
        )
      );
    }

    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    const { data: subscriber, error } = await supabase
      .from('email_subscribers')
      .select('id')
      .eq('verification_token_hash', tokenHash)
      .gt(
        'verification_expires_at',
        new Date().toISOString()
      )
      .eq('is_verified', false)
      .maybeSingle();

    if (error) throw error;

    if (!subscriber) {
      return res.status(400).send(
        createPage(
          'Link expired',
          'This link has expired or has already been used. Please request a new verification link.'
        )
      );
    }

    const { error: updateError } = await supabase
      .from('email_subscribers')
      .update({
        is_verified: true,
        is_active: true,
        verified_at: new Date().toISOString(),
        verification_token_hash: null,
        verification_expires_at: null
      })
      .eq('id', subscriber.id);

    if (updateError) throw updateError;

    return res.status(200).send(
      createPage(
        'Email verified',
        'Your AirMesh email address is verified. Your selected daily notification preferences are now eligible for scheduled checks. Emails are sent only when a selected threshold is exceeded and fresh readings are available.'
      )
    );

  } catch (error) {
    console.error('AirMesh verification error:', error);

    return res.status(500).send(
      createPage(
        'Something went wrong',
        'We could not verify your subscription right now. Please try again later.'
      )
    );
  }
}