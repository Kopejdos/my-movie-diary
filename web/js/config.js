// Konfigurace webu.
// Obě hodnoty Supabase jsou veřejné – bezpečnost zajišťují pravidla RLS v databázi.
// NIKDY sem nepatří secret key ani TMDB token.

export const SUPABASE_URL = "https://vvnexfdnfvwbwluazwoo.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ECIGAmDLE3Fj8FNTnx0mgw_P1dEBspM";

// Adresa webu – kam se uživatel vrací z ověřovacího e-mailu
export const SITE_URL = "https://kopejdos.github.io/my-movie-diary/";

// Plakáty z CDN TMDB (w342 = šířka 342 px, dost ostré i na telefonu)
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

// Pravidla pro registraci (stejná jako v databázi)
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;
export const PASSWORD_MIN_LENGTH = 8;
