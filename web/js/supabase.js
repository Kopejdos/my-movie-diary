// Jediný klient Supabase pro celý web.

// Knihovna je uložená v projektu jako jeden soubor (vendor/) – dřív se z CDN
// skládala z desítek malých souborů za sebou, což zdržovalo start aplikace.
import { createClient } from "../vendor/supabase-js-2.119.0.min.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

// Adresa, se kterou se web otevřel – návrat z Googlu nebo z odkazu v e-mailu nese ?code=…
// nebo chybu. Uloží se dřív, než ji knihovna zpracuje a z adresy odstraní (V2.4).
export const launchUrl = new URL(window.location.href);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,      // přihlášení přežije zavření prohlížeče
        autoRefreshToken: true,
        detectSessionInUrl: true,  // návrat z Google / ověřovacího e-mailu
        flowType: "pkce",          // výsledek přihlášení přijde jako ?code=…, ne v # (ten patří routeru)
    },
});
