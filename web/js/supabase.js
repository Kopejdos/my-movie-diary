// Jediný klient Supabase pro celý web.
// Knihovna se načítá jako ES modul z CDN – web nepotřebuje npm ani build.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,      // přihlášení přežije zavření prohlížeče
        autoRefreshToken: true,
        detectSessionInUrl: true,  // návrat z Google / ověřovacího e-mailu
        flowType: "pkce",          // výsledek přihlášení přijde jako ?code=…, ne v # (ten patří routeru)
    },
});
