// Obrazovka: registrace (nickname, e-mail, heslo).

import {
    signUp, isUsernameAvailable, isUsernameAllowed, isSignedIn, resendConfirmation, passwordProblem,
} from "../auth.js";
import { navigate } from "../router.js";
import { USERNAME_PATTERN, PASSWORD_MIN_LENGTH, MIN_AGE } from "../config.js";
import { TEXTS, format } from "../texts.js";
import { setAccent } from "../theme.js";
import { h, mount, toast } from "../dom.js";
import { field, googleButton, divider, termsLinks } from "./login.js";

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
    const consent = h("input", { type: "checkbox", name: "terms", required: true });
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
        h("label", { class: "consent" },
            consent,
            h("span", {}, format("termsConsent", MIN_AGE), " ", termsLinks())),
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
        const weak = passwordProblem(password.value);
        if (weak) return format(weak, PASSWORD_MIN_LENGTH);
        if (password.value !== passwordRepeat.value) return TEXTS.errorPasswordMismatch;
        if (!consent.checked) return TEXTS.errorTermsRequired;
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
            if (!(await isUsernameAllowed(name))) {
                error.textContent = TEXTS.errorUsernameNotAllowed;
                submit.disabled = false;
                return;
            }
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
                const address = email.value.trim();
                const resend = h("button", { class: "btn btn--block", type: "button" }, TEXTS.resendConfirmation);
                resend.addEventListener("click", async () => {
                    resend.disabled = true;
                    try {
                        await resendConfirmation({ login: address });
                        toast(TEXTS.resendDone);
                    } catch (e) {
                        toast(e.code === "rate_limited" ? TEXTS.resendRateLimited : format("errorGeneric", e.message), "error");
                    }
                    resend.disabled = false;
                });
                mount(container, h("div", { class: "auth-page" },
                    h("div", { class: "auth-form" },
                        h("span", { class: "eyebrow" }, "✉️"),
                        h("h1", {}, TEXTS.registerTitle),
                        h("p", {}, TEXTS.registerCheckEmail),
                        h("p", { class: "muted" }, address),
                        h("a", { class: "btn btn--primary btn--block", href: "#/login" }, TEXTS.navSignIn),
                        resend,
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
