// ============================================================
// Supabase Edge Function: send-sms
// Uses Africa's Talking SMS API (best rates for Kenya).
// Deploy: supabase functions deploy send-sms
// Env vars needed in Supabase Dashboard → Settings → Edge Functions:
//   AT_API_KEY   — from africastalking.com → Settings → API Key
//   AT_USERNAME  — your Africa's Talking username (e.g. "sandbox" for testing)
//   AT_SENDER_ID — optional short code or sender name (e.g. "HelpDesk")
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const AT_API_KEY   = Deno.env.get('AT_API_KEY')   ?? '';
const AT_USERNAME  = Deno.env.get('AT_USERNAME')  ?? 'sandbox';
const AT_SENDER_ID = Deno.env.get('AT_SENDER_ID') ?? '';

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

    // Ensure phone number is in international format
    const phone = to.startsWith('+') ? to : `+${to}`;

    const params = new URLSearchParams({
      username: AT_USERNAME,
      to: phone,
      message: message,
      ...(AT_SENDER_ID ? { from: AT_SENDER_ID } : {}),
    });

    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Africa\'s Talking SMS error:', result);
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
    console.error('send-sms error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
