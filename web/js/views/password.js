// Obrazovky pro hesla (V2.5):
//   #/forgot          – žádost o odkaz pro nastavení nového hesla
//   #/reset-password  – nové heslo po návratu z odkazu v e-mailu

import { requestPasswordReset, setNewPassword, isSignedIn, isRecoverySession, passwordProblem } from "../auth.js";
import { navigate } from "../router.js";
import { PASSWORD_MIN_LENGTH } from "../config.js";
import { setAccent } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, toast } from "../dom.js";
import { field } from "./login.js";

/** Text chyby hesla podle kódu (stejná pravidla jako v databázi). */
export function passwordErrorText(code, fallback) {
    if (code === "errorPasswordShort") return format("errorPasswordShort", PASSWORD_MIN_LENGTH);
    if (code === "errorPasswordWeak" || code === "weak_password") return TEXTS.errorPasswordWeak;
    if (code === "same_password") return TEXTS.errorPasswordSame;
    if (code === "wrong_password") return TEXTS.errorPasswordWrong;
    if (code === "rate_limited") return TEXTS.resendRateLimited;
    return fallback;
}

/** #/forgot – e-mail → odkaz pro nové heslo. */
export function forgotPasswordView(container) {
    setAccent(null);
    document.title = `${TEXTS.forgotTitle} · ${TEXTS.appName}`;

    const email = h("input", { type: "email", name: "email", required: true, autocomplete: "email" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, TEXTS.forgotSubmit);

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h1", {}, TEXTS.forgotTitle),
        h("p", { class: "muted" }, TEXTS.forgotIntro),
        field(TEXTS.email, email, TEXTS.forgotEmailHint),
        error,
        submit,
        h("p", { class: "auth-form__switch" }, h("a", { href: "#/login" }, TEXTS.backToSignIn)),
    );
    mount(container, h("div", { class: "auth-page" }, form));
    email.focus();

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        const address = email.value.trim();
        if (!address || !email.checkValidity()) {
            error.textContent = TEXTS.errorEmail;
            return;
        }
        submit.disabled = true;
        try {
            await requestPasswordReset(address);
            // Stejná odpověď, ať účet existuje, nebo ne
            mount(container, h("div", { class: "auth-page" },
                h("div", { class: "auth-form" },
                    h("span", { class: "eyebrow" }, "✉️"),
                    h("h1", {}, TEXTS.forgotSentTitle),
                    h("p", {}, TEXTS.forgotSentText),
                    h("p", { class: "muted" }, address),
                    h("p", { class: "hint" }, TEXTS.forgotSameBrowser),
                    h("a", { class: "btn btn--block", href: "#/login" }, TEXTS.backToSignIn),
                )));
        } catch (e) {
            error.textContent = passwordErrorText(e.code, format("errorGeneric", e.message));
            submit.disabled = false;
        }
    }
}

/** #/reset-password – nové heslo (uživatel je přihlášený díky odkazu z e-mailu). */
export function resetPasswordView(container) {
    setAccent(null);
    document.title = `${TEXTS.resetTitle} · ${TEXTS.appName}`;

    if (!isSignedIn()) {
        mount(container, h("div", { class: "auth-page" },
            h("div", { class: "auth-form" },
                h("h1", {}, TEXTS.resetTitle),
                h("p", {}, TEXTS.resetNeedsLink),
                h("a", { class: "btn btn--primary btn--block", href: "#/forgot" }, TEXTS.forgotSubmit))));
        return;
    }

    const password = h("input", { type: "password", name: "password", required: true, autocomplete: "new-password" });
    const repeat = h("input", { type: "password", name: "password-repeat", required: true, autocomplete: "new-password" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, TEXTS.resetSubmit);

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h1", {}, TEXTS.resetTitle),
        h("p", { class: "muted" }, isRecoverySession() ? TEXTS.resetIntro : TEXTS.resetIntroSignedIn),
        field(TEXTS.newPassword, password, format("passwordHintRules", PASSWORD_MIN_LENGTH)),
        field(TEXTS.passwordRepeat, repeat),
        error,
        submit,
    );
    mount(container, h("div", { class: "auth-page" }, form));
    password.focus();

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        const problem = passwordProblem(password.value);
        if (problem) {
            error.textContent = passwordErrorText(problem);
            return;
        }
        if (password.value !== repeat.value) {
            error.textContent = TEXTS.errorPasswordMismatch;
            return;
        }
        submit.disabled = true;
        try {
            await setNewPassword(password.value);
            toast(TEXTS.passwordChanged);
            navigate("/");
        } catch (e) {
            error.textContent = passwordErrorText(e.code, format("errorGeneric", e.message));
            submit.disabled = false;
        }
    }
}
