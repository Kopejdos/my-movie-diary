// Konfigurace webu.
// Obě hodnoty Supabase jsou veřejné – bezpečnost zajišťují pravidla RLS v databázi.
// NIKDY sem nepatří secret key ani TMDB token.

// Verze aplikace a měsíc poslední aktualizace – zobrazují se v patičce.
// Při vydání nové verze změnit tady + záznam do CHANGELOG.md + tag (viz docs/decisions.md → Verzování).
export const APP_VERSION = "V3.1.1";
export const APP_UPDATED = "November 2026";

export const SUPABASE_URL = "https://vvnexfdnfvwbwluazwoo.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ECIGAmDLE3Fj8FNTnx0mgw_P1dEBspM";

// Adresa webu – kam se uživatel vrací z ověřovacího e-mailu
export const SITE_URL = "https://kopejdos.github.io/my-movie-diary/";

// Obrázky z CDN TMDB – adresa = TMDB_IMAGE_ROOT + velikost + cesta k souboru.
// Velikost podle toho, jak velký je obrázek na stránce (× 2 kvůli ostrým displejům):
export const TMDB_IMAGE_ROOT = "https://image.tmdb.org/t/p/";
export const POSTER_SIZES = {
    tiny: "w92",       // žebříček ve statistikách (38 px)
    small: "w154",     // řádky filmů, Up next (48–64 px)
    large: "w342",     // karty kolekcí a hero karta (150–190 px)
};
export const BACKDROP_SIZES = {
    phone: "w780",     // banner na telefonu
    desktop: "w1280",  // banner na velké obrazovce
};

// Provozovatel a kontakt (patička, About, Terms of Service, zásady ochrany soukromí).
// Kontakt je i ve statických stránkách privacy.html a terms.html a v patičce index.html.
export const OPERATOR_NAME = "Adam Kopecký (Kopejdos)";
export const CONTACT_EMAIL = "mymoviediary.support@gmail.com";
export const GITHUB_URL = "https://github.com/Kopejdos/my-movie-diary";

// Minimální věk pro účet (hranice pro souhlas se zpracováním údajů online v Česku)
export const MIN_AGE = 15;

// Pravidla pro registraci (stejná jako v databázi)
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;
export const PASSWORD_MIN_LENGTH = 8;
// Heslo musí obsahovat písmeno i číslici (stejně jako nastavení Supabase → Email → Password requirements, V2.5)
export const PASSWORD_NEEDS_LETTER_AND_DIGIT = true;

// Ochrana proti robotům – Cloudflare Turnstile (V2.6).
// Site key je veřejný (patří do webu); SECRET key sem NIKDY – ten patří jen do Supabase
// (Attack Protection) a do tajemství Edge Functions (TURNSTILE_SECRET_KEY).
// Prázdný řetězec = ochrana vypnutá.
export const TURNSTILE_SITE_KEY = "0x4AAAAAAF1iO11Mh0prkHNd";
