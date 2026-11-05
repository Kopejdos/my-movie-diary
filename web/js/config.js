// Konfigurace webu.
// Obě hodnoty Supabase jsou veřejné – bezpečnost zajišťují pravidla RLS v databázi.
// NIKDY sem nepatří secret key ani TMDB token.

// Verze aplikace a měsíc poslední aktualizace – zobrazují se v patičce.
// Při vydání nové verze změnit tady + záznam do CHANGELOG.md + tag (viz docs/decisions.md → Verzování).
export const APP_VERSION = "V1.2.1";
export const APP_UPDATED = "November 2026";

export const SUPABASE_URL = "https://vvnexfdnfvwbwluazwoo.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ECIGAmDLE3Fj8FNTnx0mgw_P1dEBspM";

// Adresa webu – kam se uživatel vrací z ověřovacího e-mailu
export const SITE_URL = "https://kopejdos.github.io/my-movie-diary/";

// Plakáty z CDN TMDB (w342 = šířka 342 px, dost ostré i na telefonu)
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

// Širokoúhlé záběry z filmů pro banner (w1280 = ostré i na velkém monitoru)
export const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280";

// Pravidla pro registraci (stejná jako v databázi)
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;
export const PASSWORD_MIN_LENGTH = 8;
