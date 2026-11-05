// Obrazovka: registrace (nickname, e-mail, heslo).

import { signUp, isUsernameAvailable, isSignedIn } from "../auth.js";
import { navigate } from "../router.js";
import { USERNAME_PATTERN, PASSWORD_MIN_LENGTH } from "../config.js";
import { TEXTS, format } from "../texts.js";
import { setAccent } from "../theme.js";
import { h, mount } from "../dom.js";
import { field, googleButton, divider } from "./login.js";

export async function registerView(container) {
    setAccent(null);
    if (isSignedIn()) {
        navigate("/");
        return;
    }
    document.title = `${TEXTS.registerTitle} · ${TEXTS.appName}`;

    const username = h("input", { type: "text", name: "username", required: true,
        autocomplete: "username", maxlength: 24, spellcheck: "false" });
    const email = h("input", { type: "email", name: "email", required: true, autocomplete: "email" });
    const password = h("input", { type: "password", name: "password", required: true,
        autocomplete: "new-password", minlength: PASSWORD_MIN_LENGTH });
    const passwordRepeat = h("input", { type: "password", name: "password-repeat", required: true,
        autocomplete: "new-password" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, TEXTS.submitRegister);

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h1", {}, TEXTS.registerTitle),
        googleButton(),
        divider(),
        field(TEXTS.username, username, TEXTS.usernameHint),
        field(TEXTS.email, email),
        field(TEXTS.password, password, format("passwordHint", PASSWORD_MIN_LENGTH)),
        field(TEXTS.passwordRepeat, passwordRepeat),
        error,
        submit,
        h("p", { class: "auth-form__switch" },
            `${TEXTS.haveAccount} `, h("a", { href: "#/login" }, TEXTS.navSignIn)),
    );

    mount(container, h("div", { class: "auth-page" }, form));
    username.focus();

    /** Kontrola formuláře v prohlížeči – vrací text chyby, nebo null. */
    function validate() {
        if (!USERNAME_PATTERN.test(username.value.trim())) return TEXTS.errorUsernameFormat;
        if (!email.value.trim() || !email.checkValidity()) return TEXTS.errorEmail;
        if (password.value.length < PASSWORD_MIN_LENGTH) return format("errorPasswordShort", PASSWORD_MIN_LENGTH);
        if (password.value !== passwordRepeat.value) return TEXTS.errorPasswordMismatch;
        return null;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";

        const problem = validate();
        if (problem) {
            error.textContent = problem;
            return;
        }

        submit.disabled = true;
        try {
            const name = username.value.trim();
            if (!(await isUsernameAvailable(name))) {
                error.textContent = TEXTS.errorUsernameTaken;
                submit.disabled = false;
                return;
            }

            const { needsConfirmation } = await signUp({
                username: name,
                email: email.value.trim(),
                password: password.value,
            });

            if (needsConfirmation) {
                mount(container, h("div", { class: "auth-page" },
                    h("div", { class: "auth-form" },
                        h("h1", {}, TEXTS.registerTitle),
                        h("p", {}, TEXTS.registerCheckEmail),
                        h("a", { class: "btn btn--primary btn--block", href: "#/login" }, TEXTS.navSignIn),
                    ),
                ));
            }
            // Bez potvrzování e-mailu je uživatel rovnou přihlášený – přesměruje app.js
        } catch (e) {
            error.textContent = e.message;
            submit.disabled = false;
        }
    }
}
