// Obrazovka: přihlášení e-mailem a heslem.

import { signIn, isSignedIn } from "../auth.js";
import { navigate } from "../router.js";
import { TEXTS } from "../texts.js";
import { h, mount } from "../dom.js";

export async function loginView(container) {
    if (isSignedIn()) {
        navigate("/");
        return;
    }
    document.title = `${TEXTS.signInTitle} · ${TEXTS.appName}`;

    const email = h("input", { type: "email", name: "email", required: true, autocomplete: "email" });
    const password = h("input", { type: "password", name: "password", required: true, autocomplete: "current-password" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, TEXTS.submitSignIn);

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h1", {}, TEXTS.signInTitle),
        field(TEXTS.email, email),
        field(TEXTS.password, password),
        error,
        submit,
        h("p", { class: "auth-form__switch" },
            `${TEXTS.noAccount} `, h("a", { href: "#/register" }, TEXTS.navRegister)),
    );

    mount(container, h("div", { class: "auth-page" }, form));
    email.focus();

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        submit.disabled = true;
        try {
            await signIn({ email: email.value.trim(), password: password.value });
            // Přesměrování na přehled zařídí app.js po změně přihlášení
        } catch (e) {
            error.textContent = e?.code === "invalid_credentials" || /invalid login/i.test(e?.message)
                ? TEXTS.errorInvalidLogin
                : e.message;
            submit.disabled = false;
        }
    }
}

/** Popisek + vstupní pole (+ volitelná nápověda). */
export function field(label, input, hint) {
    return h("label", { class: "field" },
        h("span", { class: "field__label" }, label),
        input,
        hint ? h("span", { class: "field__hint" }, hint) : null,
    );
}
