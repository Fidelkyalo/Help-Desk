// ============================================================
// Supabase Edge Function: send-email
// Uses Resend (resend.com) to deliver real emails.
// Deploy: supabase functions deploy send-email
// Env vars needed in Supabase Dashboard → Settings → Edge Functions:
//   RESEND_API_KEY  — from resend.com/api-keys
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_ADDRESS   = 'Help Desk <onboarding@resend.dev>';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { to, subject, message, replyTo } = await req.json();

    if (!to || !subject || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const emailBody = {
      from: FROM_ADDRESS,
      to: [to],
      subject: subject,
      // Plain text version
      text: message,
      // HTML version — clean, professional layout
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>${subject}</title>
        </head>
        <body style="margin:0;padding:0;background:#f4f6f9;font-family:Inter,Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px 40px;text-align:center;">
                      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                        🏛️ Help Desk Support
                      </h1>
                      <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;">
                        Ministry of Labour and Social Protection
                      </p>
                    </td>
                  </tr>
                  <!-- Body -->
                  <tr>
                    <td style="padding:36px 40px;">
                      <p style="color:#1e293b;font-size:15px;line-height:1.7;margin:0 0 20px;">
                        ${message.replace(/\n/g, '<br/>')}
                      </p>
                      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;"/>
                      <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">
                        This is an automated notification from the Help Desk system.<br/>
                        ${replyTo ? `To reply, contact: <a href="mailto:${replyTo}" style="color:#2563eb;">${replyTo}</a>` : 'Please do not reply to this email.'}
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                      <p style="color:#94a3b8;font-size:11px;margin:0;">
                        © ${new Date().getFullYear()} Ministry of Labour and Social Protection · State Department for Social Protection and Senior Citizen Affairs · GOK
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      // Set reply-to as the admin's email so customer replies go directly to admin
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: result }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('send-email error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
