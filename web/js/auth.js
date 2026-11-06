// Přihlášení, registrace a stav přihlášeného uživatele.
// Čistá logika – nic nevykresluje, obrazovky se jen přihlásí k odběru změn (onAuthChange).

import { supabase, launchUrl } from "./supabase.js";
import {
    SITE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PASSWORD_MIN_LENGTH, PASSWORD_NEEDS_LETTER_AND_DIGIT,
} from "./config.js";

/** Aktuální stav: user = účet Supabase, profile = řádek z tabulky profiles. */
const state = { user: null, profile: null };

// Návrat z odkazu pro obnovu hesla: knihovna po startu vyšle PASSWORD_RECOVERY (s malým
// zpožděním) – posluchač musí existovat dřív, než přihlášení doběhne (V2.5)
let recoveryPending = false;
supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recoveryPending = true;
});

/** Přišel uživatel z odkazu pro obnovu hesla (a je díky němu přihlášený)? */
export function isRecoverySession() {
    return recoveryPending;
}

/**
 * Kontrola hesla podle pravidel aplikace – vrací klíč textu chyby, nebo null.
 * Stejná pravidla nastavená v Supabase hlídají i server.
 */
export function passwordProblem(password) {
    if (password.length < PASSWORD_MIN_LENGTH) return "errorPasswordShort";
    if (PASSWORD_NEEDS_LETTER_AND_DIGIT && !(/[A-Za-z]/.test(password) && /\d/.test(password))) return "errorPasswordWeak";
    return null;
}

/** Chyba Supabase u hesla → výjimka s kódem pro srozumitelnou hlášku. */
function passwordError(error) {
    const wrapped = new Error(error.message);
    // Nejdřív „stejné heslo“ – jeho text („New password should be different…“) by jinak chytilo i pravidlo pro slabé heslo
    if (error.code === "same_password" || /different from the old/i.test(error.message)) wrapped.code = "same_password";
    else if (error.code === "weak_password" || /password should|weak/i.test(error.message)) wrapped.code = "weak_password";
    else if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) wrapped.code = "rate_limited";
    else if (isCaptchaFailure(error)) wrapped.code = "captcha_failed";
    return wrapped;
}

/** Odmítla Supabase požadavek kvůli neplatné / chybějící CAPTCHA (V2.6)? */
function isCaptchaFailure(error) {
    return error?.code === "captcha_failed" || /captcha/i.test(error?.message ?? "");
}
const listeners = new Set();

export function getUser() {
    return state.user;
}

export function getProfile() {
    return state.profile;
}

export function isSignedIn() {
    return state.user !== null;
}

/** Přihlásí posluchače změn přihlášení. Vrací funkci pro odhlášení odběru. */
export function onAuthChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) listener(state);
}

/** Načte profil přihlášeného uživatele (nickname). */
async function loadProfile(user) {
    if (!user) return null;
    const { data, error } = await supabase
        .from("profiles")
        .select("id, username, is_admin, is_public")
        .eq("id", user.id)
        .maybeSingle();
    if (error) {
        console.error("Profile load failed", error);
        return null;
    }
    return data;
}

async function applySession(session) {
    const user = session?.user ?? null;
    const changed = user?.id !== state.user?.id;
    state.user = user;
    if (changed || (user && !state.profile)) {
        state.profile = await loadProfile(user);
    }
    if (!user) state.profile = null;
    notify();
}

/** Zjistí přihlášení při startu webu a začne sledovat změny. */
export async function initAuth() {
    const { data } = await supabase.auth.getSession();
    await applySession(data.session);

    supabase.auth.onAuthStateChange((_event, session) => {
        // Supabase doporučuje v tomto callbacku nevolat další dotazy synchronně –
        // načtení profilu se proto odloží na další krok smyčky událostí.
        setTimeout(() => applySession(session), 0);
    });
}

/**
 * Je nickname povolený pravidly komunity? (zakázaná slova – funkce v databázi, V2.3)
 * Databáze to kontroluje i při uložení; tohle je jen včasná hláška ve formuláři.
 */
export async function isUsernameAllowed(username) {
    const { data, error } = await supabase.rpc("is_username_allowed", { p_username: username });
    if (error) throw new Error(error.message);
    return data === true;
}

/** Chyba z databáze „nick porušuje pravidla“ → srozumitelná výjimka s kódem. */
function usernameError(error) {
    const wrapped = new Error(error.message);
    if (/username_not_allowed/.test(error.message)) wrapped.code = "username_not_allowed";
    return wrapped;
}

/** Je nickname volný? (funkce v databázi, funguje i bez přihlášení) */
export async function isUsernameAvailable(username) {
    const { data, error } = await supabase.rpc("is_username_available", { p_username: username });
    if (error) throw new Error(error.message);
    return data === true;
}

/**
 * Registrace. Nickname se předá v metadatech, profil založí trigger v databázi.
 * Vrací { needsConfirmation: true }, když je zapnuté potvrzování e-mailu.
 * captchaToken = token z Turnstile (V2.6; bez zapnuté CAPTCHA undefined).
 */
export async function signUp({ username, email, password, captchaToken }) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { username },
            emailRedirectTo: SITE_URL,
            captchaToken,
        },
    });
    if (error) {
        const wrapped = new Error(error.message);
        if (isCaptchaFailure(error)) wrapped.code = "captcha_failed";
        throw wrapped;
    }
    return { needsConfirmation: !data.session };
}

/**
 * Přihlášení e-mailem NEBO nickem.
 * E-mail jde rovnou do Supabase Auth; nick přes Edge Function "login",
 * která k němu na serveru dohledá e-mail a vrátí tokeny relace.
 */
export async function signIn({ login, password, captchaToken }) {
    if (login.includes("@")) {
        const { error } = await supabase.auth.signInWithPassword({ email: login, password, options: { captchaToken } });
        if (error) {
            // Nepotvrzený e-mail → kód pro srozumitelnou hlášku a tlačítko „poslat znovu“
            if (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
                error.code = "email_not_confirmed";
            } else if (isCaptchaFailure(error)) {
                error.code = "captcha_failed";
            }
            throw error;
        }
        return;
    }

    // Funkce „login“ si token ověří sama u Cloudflare (V2.6)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ login, password, captchaToken }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body.error ?? `HTTP ${response.status}`);
        error.code = body.error;
        throw error;
    }

    const { error } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
    });
    if (error) throw error;
}

/**
 * Znovu pošle potvrzovací e-mail (V2.4).
 * E-mail jde rovnou přes Supabase Auth; u nicku přes funkci „login“ (vyžaduje správné heslo,
 * e-mail se do prohlížeče nedostane). Při příliš častém posílání chyba s kódem rate_limited.
 */
export async function resendConfirmation({ login, password, captchaToken }) {
    if (login.includes("@")) {
        const { error } = await supabase.auth.resend({
            type: "signup", email: login, options: { emailRedirectTo: SITE_URL, captchaToken },
        });
        if (error) {
            const wrapped = new Error(error.message);
            if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) wrapped.code = "rate_limited";
            else if (isCaptchaFailure(error)) wrapped.code = "captcha_failed";
            throw wrapped;
        }
        return;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ login, password, resend: true, captchaToken }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.resent) {
        const error = new Error(body.error ?? `HTTP ${response.status}`);
        error.code = body.error;
        throw error;
    }
}

/**
 * Odkaz pro nastavení nového hesla na e-mail (V2.5). Supabase odpoví stejně, ať účet
 * existuje, nebo ne – nedá se tak zjistit, kdo má účet. Odkaz vede na web s ?reset=1.
 */
export async function requestPasswordReset(email, captchaToken) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}?reset=1`, captchaToken });
    if (error) throw passwordError(error);
}

/** Nové heslo po návratu z odkazu pro obnovu (uživatel je díky odkazu přihlášený). */
export async function setNewPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw passwordError(error);
    recoveryPending = false;
}

/** Má účet heslo? (registrace e-mailem; účet jen z Googlu heslo nemá) */
export function hasPassword() {
    return (state.user?.identities ?? []).some((identity) => identity.provider === "email")
        || state.user?.app_metadata?.provider === "email";
}

/**
 * Změna hesla v profilu (V2.5). Účet s heslem musí zadat současné – ověří se novým
 * přihlášením (to chce CAPTCHA token, V2.6); účet z Googlu si heslo nastaví poprvé
 * (pak se může přihlásit i e-mailem).
 */
export async function changePassword({ current, next, captchaToken }) {
    if (hasPassword()) {
        const { error } = await supabase.auth.signInWithPassword({
            email: state.user.email, password: current ?? "", options: { captchaToken },
        });
        if (error) {
            const wrapped = new Error(error.message);
            wrapped.code = isCaptchaFailure(error) ? "captcha_failed" : "wrong_password";
            throw wrapped;
        }
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) throw passwordError(error);
}

const OAUTH_FLAG = "mmd-oauth-pending";

/**
 * Co přineslo otevření webu z odkazu (V2.4):
 * { type: "email-confirmed" } – návrat z potvrzovacího e-mailu,
 * { type: "oauth" } – návrat z Googlu,
 * { type: "error", code, message } – vypršený / použitý odkaz apod.,
 * nebo null (běžné otevření). Vyhodnotí se jednou, při startu.
 */
export function authRedirectResult() {
    const query = launchUrl.searchParams;
    // Chyba může přijít v ?… i v #… (pak by #error=… četl router jako adresu stránky)
    const hash = launchUrl.hash.startsWith("#error") ? new URLSearchParams(launchUrl.hash.slice(1)) : null;
    const errorParams = query.has("error") || query.has("error_description") ? query : hash;

    let oauth = false;
    try {
        oauth = sessionStorage.getItem(OAUTH_FLAG) === "1";
        sessionStorage.removeItem(OAUTH_FLAG);
    } catch {
        // bez úložiště se návrat z Googlu nepozná – jen se neukáže hláška
    }

    if (errorParams) {
        return {
            type: "error",
            recovery: query.has("reset"),
            code: errorParams.get("error_code") ?? errorParams.get("error") ?? "unknown",
            message: errorParams.get("error_description") ?? "",
        };
    }
    if (query.has("reset")) return { type: "recovery" };          // odkaz pro obnovu hesla (V2.5)
    if (query.has("code")) return { type: oauth ? "oauth" : "email-confirmed" };
    return null;
}

/** Přihlášení přes Google – přesměruje na Google a zpět na web. */
export async function signInWithGoogle() {
    try {
        sessionStorage.setItem(OAUTH_FLAG, "1");   // návrat s ?code= pak není potvrzení e-mailu
    } catch {
        // nevadí
    }
    const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: SITE_URL },
    });
    if (error) throw new Error(error.message);
}

/** Má uživatel ještě automaticky vygenerovaný nickname (přihlášení přes Google)? */
export function hasGeneratedUsername() {
    return /^user_[0-9a-f]{8}$/.test(state.profile?.username ?? "");
}

/** Změna nicku přihlášeného uživatele. */
export async function updateUsername(username) {
    const { data, error } = await supabase
        .from("profiles")
        .update({ username })
        .eq("id", state.user.id)
        .select("id, username, is_admin, is_public")
        .single();
    if (error) throw usernameError(error);
    state.profile = data;
    notify();
}

/** Zveřejnění / skrytí profilu přihlášeného uživatele (V2.0). */
export async function setProfilePublic(isPublic) {
    const { data, error } = await supabase
        .from("profiles")
        .update({ is_public: isPublic })
        .eq("id", state.user.id)
        .select("id, username, is_admin, is_public")
        .single();
    if (error) throw new Error(error.message);
    state.profile = data;
    notify();
}

/**
 * Smazání vlastního účtu i všech dat (Edge Function „account“, V2.3).
 * Relaci v prohlížeči zahodí až signOutLocal() – obrazovka mezitím přejde jinam.
 * Správce se takhle smazat nemůže (chyba s kódem admin_cannot_delete).
 */
export async function deleteMyAccount() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in");

    const response = await fetch(`${SUPABASE_URL}/functions/v1/account`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "delete" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body.error ?? `HTTP ${response.status}`);
        error.code = body.error;
        throw error;
    }
}

/** Zahodí relaci jen v tomto prohlížeči (po smazání účtu už na serveru není co odhlašovat). */
export async function signOutLocal() {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
}
