// Ochrana proti robotům – Cloudflare Turnstile (V2.6).
//
// Formuláře, které posílají heslo nebo e-mail (registrace, přihlášení, obnova hesla,
// znovuposlání potvrzení, změna hesla), si vytvoří widget přes createCaptcha().
// Turnstile většinou nic nechce – ověří prohlížeč na pozadí. Jen když si není jistý,
// ukáže ve formuláři políčko „Verify you are human“.
//
// Token platí jednou: po každém odeslání formuláře se volá reset() a widget si
// na pozadí vyžádá nový (pro další pokus).
//
// Bez klíče TURNSTILE_SITE_KEY v config.js je ochrana vypnutá – token je undefined
// a Supabase ho nevyžaduje, dokud se CAPTCHA nezapne i v jeho nastavení.

import { TURNSTILE_SITE_KEY } from "./config.js";
import { currentTheme } from "./theme.js";
import { TEXTS } from "./texts.js";
import { h } from "./dom.js";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 30_000;      // déle se na ověření nečeká (pak hláška a nový pokus)
const MAX_WAIT_FRAMES = 600;          // ~10 s čekání, než se prvek objeví ve stránce

let scriptPromise = null;

/** Je ochrana zapnutá (vyplněný klíč webu)? */
export function captchaEnabled() {
    return Boolean(TURNSTILE_SITE_KEY);
}

/** Chyba s kódem pro srozumitelnou hlášku. */
function captchaError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

/** Načte skript Turnstile (jednou za otevření stránky, jen na stránkách s formulářem). */
function loadScript() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    scriptPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(captchaError("captcha_unavailable")));
        script.onerror = () => {
            scriptPromise = null;          // příště zkusit znovu (např. po obnovení připojení)
            script.remove();
            reject(captchaError("captcha_unavailable"));
        };
        document.head.append(script);
    });
    return scriptPromise;
}

/**
 * Widget pro jeden formulář.
 * Vrací { element, token(), reset(), prepare() }:
 *   element  – vložit do formuláře (nad tlačítko odeslat),
 *   token()  – slib s tokenem pro Supabase (undefined, když je ochrana vypnutá),
 *   reset()  – po použití tokenu (úspěch i chyba),
 *   prepare()– u lazy widgetu spustí ověření dřív, než uživatel klikne na odeslat.
 * lazy = skript se načte až při prepare() / token() (karta v profilu, kterou většina nepoužije).
 */
export function createCaptcha({ lazy = false } = {}) {
    const element = h("div", { class: "captcha" });
    if (!captchaEnabled()) {
        return { element, token: async () => undefined, reset() {}, prepare() {} };
    }

    let widgetId = null;
    let started = false;
    let currentToken = null;
    let failure = null;
    const waiters = new Set();

    /** Předá výsledek všem, kdo na token čekají. */
    function settle() {
        for (const waiter of waiters) {
            if (currentToken) waiter.resolve(currentToken);
            else if (failure) waiter.reject(failure);
            else continue;
            clearTimeout(waiter.timer);
            waiters.delete(waiter);
        }
    }

    function start() {
        if (started) return;
        started = true;
        loadScript()
            .then((turnstile) => renderWhenAttached(turnstile, 0))
            .catch((error) => {
                started = false;
                failure = error;
                settle();
            });
    }

    // Widget se dá vykreslit až do prvku, který už je ve stránce
    function renderWhenAttached(turnstile, frame) {
        if (!element.isConnected) {
            if (frame < MAX_WAIT_FRAMES) requestAnimationFrame(() => renderWhenAttached(turnstile, frame + 1));
            else started = false;
            return;
        }
        widgetId = turnstile.render(element, {
            sitekey: TURNSTILE_SITE_KEY,
            theme: currentTheme(),
            appearance: "interaction-only",      // políčko jen tehdy, když je potřeba kliknout
            "refresh-expired": "auto",
            callback: (token) => {
                currentToken = token;
                failure = null;
                settle();
            },
            "expired-callback": () => {
                currentToken = null;
            },
            "error-callback": () => {
                currentToken = null;
                failure = captchaError("captcha_failed");
                settle();
                // Turnstile to sám zkusí znovu (výchozí retry: auto)
            },
        });
    }

    function token() {
        start();
        if (currentToken) return Promise.resolve(currentToken);
        if (failure) {
            // Minulý pokus selhal – zkusit ověření znovu
            failure = null;
            if (widgetId !== null) window.turnstile.reset(widgetId);
        }
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject, timer: null };
            waiter.timer = setTimeout(() => {
                waiters.delete(waiter);
                reject(captchaError("captcha_timeout"));
            }, TOKEN_TIMEOUT_MS);
            waiters.add(waiter);
        });
    }

    function reset() {
        currentToken = null;
        failure = null;
        if (widgetId !== null && element.isConnected) window.turnstile.reset(widgetId);
    }

    if (!lazy) start();
    return { element, token, reset, prepare: start };
}

/** Je to chyba ověření (náš widget, Supabase nebo funkce „login“)? */
export function isCaptchaError(error) {
    return ["captcha_failed", "captcha_timeout", "captcha_unavailable"].includes(error?.code)
        || /captcha/i.test(error?.message ?? "");
}

/** Hláška pro chybu ověření, nebo null (jiná chyba). */
export function captchaErrorText(error) {
    if (!isCaptchaError(error)) return null;
    return error.code === "captcha_unavailable" ? TEXTS.errorCaptchaUnavailable : TEXTS.errorCaptcha;
}
