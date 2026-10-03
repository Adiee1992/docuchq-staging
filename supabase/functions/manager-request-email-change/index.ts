import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Authentication required.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) return json({ error: 'Invalid session.' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: manager } = await admin.from('profiles').select('role').eq('id', caller.id).single();
    if (manager?.role !== 'manager') return json({ error: 'Only managers can request customer email changes.' }, 403);

    const { customerId, newEmail, redirectTo } = await req.json();
    const normalizedEmail = String(newEmail || '').trim().toLowerCase();
    if (!customerId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return json({ error: 'Enter a valid new email address.' }, 400);
    }

    const { data: customerProfile } = await admin.from('profiles').select('id, role').eq('id', customerId).single();
    if (customerProfile?.role !== 'exporter') return json({ error: 'Exporter account not found.' }, 404);

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(customerId);
    const currentEmail = userData.user?.email;
    if (userError || !currentEmail) return json({ error: 'Customer authentication account not found.' }, 404);
    if (currentEmail.toLowerCase() === normalizedEmail) return json({ ok: true });

    const linkParams = { email: currentEmail, newEmail: normalizedEmail, options: { redirectTo } };
    const [{ data: currentLink, error: currentError }, { data: newLink, error: newError }] = await Promise.all([
      admin.auth.admin.generateLink({ type: 'email_change_current', ...linkParams }),
      admin.auth.admin.generateLink({ type: 'email_change_new', ...linkParams }),
    ]);
    if (currentError || newError) throw currentError || newError;

    const transporter = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'),
      port: Number(Deno.env.get('SMTP_PORT') || 587),
      secure: Deno.env.get('SMTP_SECURE') === 'true',
      auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
    });
    const from = Deno.env.get('SMTP_FROM') || 'DocuCHQ <no-reply@example.com>';
    const emailBody = (link: string) => `<div style="font-family:Arial,sans-serif;color:#0F172A;line-height:1.6"><h2>Confirm email address change</h2><p>A manager requested that your DocuCHQ account email be changed from <strong>${currentEmail}</strong> to <strong>${normalizedEmail}</strong>.</p><p><a href="${link}" style="display:inline-block;background:#49A8D8;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:700">Confirm Email Change</a></p><p>If you did not expect this change, do not confirm it and contact support.</p></div>`;

    await Promise.all([
      transporter.sendMail({ from, to: currentEmail, subject: 'Confirm your DocuCHQ email change', html: emailBody(currentLink.properties.action_link) }),
      transporter.sendMail({ from, to: normalizedEmail, subject: 'Confirm your new DocuCHQ email address', html: emailBody(newLink.properties.action_link) }),
    ]);

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Email change request failed.' }, 500);
  }
});
