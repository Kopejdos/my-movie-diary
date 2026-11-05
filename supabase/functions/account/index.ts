// =====================================================================
// My Movie Diary – Edge Function "account" (V2.3)
//
// Akce přihlášeného uživatele s vlastním účtem, které potřebují serverový klíč.
// POST { "action": "delete" }  → smaže účet volajícího i všechna jeho data
//
// Smazání účtu smaže díky cizím klíčům (on delete cascade) i profil,
// zhlédnutí a watchlist. Správce se takhle smazat nemůže – nejdřív musí
// předat roli jinému účtu (aby aplikace nezůstala bez správce).
//
// V nastavení funkce musí být vypnuté "Verify JWT" (přístup si ověřuje sama).
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    if (!url) throw new Error("Missing SUPABASE_URL");
    const db = createClient(url, getServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Kdo volá? Ověření přístupového tokenu z hlavičky Authorization
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "not_signed_in" }, 401);
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "invalid_session" }, 401);
    const userId = auth.user.id;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "delete") return json({ error: `Unknown action: ${body.action}` }, 400);

    const { data: profile, error: profileError } = await db
      .from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (profile?.is_admin) return json({ error: "admin_cannot_delete" }, 400);

    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: "server_error" }, 500);
  }
});
