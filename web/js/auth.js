// Přihlášení, registrace a stav přihlášeného uživatele.
// Čistá logika – nic nevykresluje, obrazovky se jen přihlásí k odběru změn (onAuthChange).

import { supabase } from "./supabase.js";
import { SITE_URL } from "./config.js";

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
        .select("id, username, is_admin")
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

/** Přihlášení e-mailem a heslem. */
export async function signIn({ email, password }) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
        .select("id, username, is_admin")
        .single();
    if (error) throw new Error(error.message);
    state.profile = data;
    notify();
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
}
