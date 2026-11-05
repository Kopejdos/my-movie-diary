// =====================================================================
// My Movie Diary – Edge Function "login"
//
// Přihlášení nickem: POST { "login": "kopejdos", "password": "…" }
// Nepotvrzený e-mail (V2.4): odpověď { error: "email_not_confirmed" } – jen při správném
// hesle; s { …, "resend": true } funkce pošle potvrzovací mail znovu (e-mail se neprozradí).
// Funkce dohledá k nicku e-mail (jen na serveru – e-mail nikdy neodejde
// do prohlížeče), přihlásí uživatele a vrátí tokeny relace.
// Web si je uloží přes supabase.auth.setSession().
//
// Přihlášení e-mailem jde rovnou přes Supabase Auth, tuhle funkci nepotřebuje.
// V nastavení funkce musí být vypnuté "Verify JWT" (volá ji nepřihlášený uživatel).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Klíč s plnými právy (starší projekty: SUPABASE_SERVICE_ROLE_KEY, novější: SUPABASE_SECRET_KEYS). */
function getServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    const key = parsed["default"] ?? Object.values(parsed)[0];
    if (key) return key;
  }
  throw new Error("No service key available in the Edge Function environment");
}

// Stejná odpověď pro neexistující nick i špatné heslo – nedá se zjistit, kdo má účet
const INVALID_LOGIN = { error: "invalid_credentials" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const { login, password, resend } = await request.json() as { login?: string; password?: string; resend?: boolean };
    if (!login || !password || typeof login !== "string" || typeof password !== "string") {
      return json(INVALID_LOGIN, 400);
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Nick → e-mail (funkce v databázi, smí ji volat jen service_role)
    const { data: email, error: lookupError } = await db.rpc("email_for_username", {
      p_username: login.trim(),
    });
    if (lookupError) throw new Error(lookupError.message);
    if (!email) return json(INVALID_LOGIN, 400);

    // 2. Přihlášení – Supabase Auth ověří heslo a vrátí relaci
    const { data, error } = await db.auth.signInWithPassword({ email, password });

    // Heslo sedí, ale e-mail není potvrzený (Supabase to hlásí až po ověření hesla)
    if (error && (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message))) {
      if (resend !== true) return json({ error: "email_not_confirmed" }, 400);
      const { error: resendError } = await db.auth.resend({ type: "signup", email });
      if (resendError) {
        const limited = resendError.status === 429 || /rate limit|security purposes/i.test(resendError.message);
        return json({ error: limited ? "rate_limited" : "resend_failed" }, limited ? 429 : 500);
      }
      return json({ ok: true, resent: true });
    }
    if (error || !data.session) return json(INVALID_LOGIN, 400);

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "server_error" }, 500);
  }
});
