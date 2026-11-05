// Přihlášení, registrace a stav přihlášeného uživatele.
// Čistá logika – nic nevykresluje, obrazovky se jen přihlásí k odběru změn (onAuthChange).

import { supabase } from "./supabase.js";
import { SITE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

/** Aktuální stav: user = účet Supabase, profile = řádek z tabulky profiles. */
const state = { user: null, profile: null };
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
 */
export async function signUp({ username, email, password }) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { username },
            emailRedirectTo: SITE_URL,
        },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
}

/**
 * Přihlášení e-mailem NEBO nickem.
 * E-mail jde rovnou do Supabase Auth; nick přes Edge Function "login",
 * která k němu na serveru dohledá e-mail a vrátí tokeny relace.
 */
export async function signIn({ login, password }) {
    if (login.includes("@")) {
        const { error } = await supabase.auth.signInWithPassword({ email: login, password });
        if (error) throw error;
        return;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ login, password }),
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

/** Přihlášení přes Google – přesměruje na Google a zpět na web. */
export async function signInWithGoogle() {
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
