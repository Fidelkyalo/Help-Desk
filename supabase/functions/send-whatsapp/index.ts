// ============================================================
// Supabase Edge Function: send-whatsapp
// Uses Africa's Talking WhatsApp API.
// Deploy: supabase functions deploy send-whatsapp
// Env vars needed in Supabase Dashboard → Settings → Edge Functions:
//   AT_API_KEY      — from africastalking.com → Settings → API Key
//   AT_USERNAME     — your Africa's Talking username
//   AT_WA_CHANNEL   — your WhatsApp channel ID from Africa's Talking dashboard
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const AT_API_KEY    = Deno.env.get('AT_API_KEY')    ?? '';
const AT_USERNAME   = Deno.env.get('AT_USERNAME')   ?? 'sandbox';
const AT_WA_CHANNEL = Deno.env.get('AT_WA_CHANNEL') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { to, message } = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const phone = to.startsWith('+') ? to : `+${to}`;

    const payload = {
      username: AT_USERNAME,
      channel: AT_WA_CHANNEL,
      to: phone,
      message: {
        type: 'text',
        text: { body: message },
      },
    };

    const res = await fetch('https://chat.africastalking.com/whatsapp/message', {
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Africa\'s Talking WhatsApp error:', result);
      return new Response(JSON.stringify({ error: result }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('send-whatsapp error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
