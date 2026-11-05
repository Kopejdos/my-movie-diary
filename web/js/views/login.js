// Obrazovka: přihlášení e-mailem nebo nickem, nebo přes Google.

import { signIn, signInWithGoogle, isSignedIn } from "../auth.js";
import { navigate } from "../router.js";
import { TEXTS } from "../texts.js";
import { setAccent } from "../theme.js";
import { h, mount, toast } from "../dom.js";

export async function loginView(container) {
    setAccent(null);
    if (isSignedIn()) {
        navigate("/");
        return;
    }
    document.title = `${TEXTS.signInTitle} · ${TEXTS.appName}`;

    // Jedno pole pro e-mail i nickname (s @ = e-mail)
    const login = h("input", { type: "text", name: "login", required: true,
        autocomplete: "username", autocapitalize: "none", spellcheck: "false" });
    const password = h("input", { type: "password", name: "password", required: true, autocomplete: "current-password" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, TEXTS.submitSignIn);

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h1", {}, TEXTS.signInTitle),
        googleButton(),
        divider(),
        field(TEXTS.emailOrNickname, login),
        field(TEXTS.password, password),
        error,
        submit,
        h("p", { class: "auth-form__switch" },
            `${TEXTS.noAccount} `, h("a", { href: "#/register" }, TEXTS.navRegister)),
    );

    mount(container, h("div", { class: "auth-page" }, form));
    login.focus();

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        submit.disabled = true;
        try {
            await signIn({ login: login.value.trim(), password: password.value });
            // Přesměrování na přehled zařídí app.js po změně přihlášení
        } catch (e) {
            error.textContent = e?.code === "invalid_credentials" || /invalid login/i.test(e?.message)
                ? TEXTS.errorInvalidLogin
                : e.message;
            submit.disabled = false;
        }
    }
}

/** Tlačítko „Continue with Google“ – sdílí ho přihlášení i registrace. */
export function googleButton() {
    return h("button", {
            class: "btn btn--block btn--google",
            type: "button",
            onClick: async (event) => {
                const button = event.currentTarget;   // po await už event.currentTarget neplatí
                button.disabled = true;
                try {
                    await signInWithGoogle();   // prohlížeč odejde na Google
                } catch (e) {
                    toast(e.message, "error");
                    button.disabled = false;
                }
            },
        },
        googleLogo(),
        TEXTS.continueWithGoogle,
    );
}

/** Oddělovač „or“ mezi Google a formulářem. */
export function divider() {
    return h("div", { class: "divider" }, h("span", {}, TEXTS.or));
}

/** Logo Google (barevné „G“) jako SVG. */
function googleLogo() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    const paths = [
        ["#FFC107", "M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"],
        ["#FF3D00", "M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"],
        ["#4CAF50", "M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"],
        ["#1976D2", "M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"],
    ];
    for (const [fill, d] of paths) {
        const path = document.createElementNS(ns, "path");
        path.setAttribute("fill", fill);
        path.setAttribute("d", d);
        svg.append(path);
    }
    return svg;
}

/** Popisek + vstupní pole (+ volitelná nápověda). */
export function field(label, input, hint) {
    return h("label", { class: "field" },
        h("span", { class: "field__label" }, label),
        input,
        hint ? h("span", { class: "field__hint" }, hint) : null,
    );
}
