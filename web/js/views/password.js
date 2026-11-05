// Obrazovky pro hesla (V2.5):
//   #/forgot          – žádost o odkaz pro nastavení nového hesla
//   #/reset-password  – nové heslo po návratu z odkazu v e-mailu
//
// Proč se e-mail nekontroluje proti nicku (V2.6): odkaz přijde jen do schránky
// zadaného e-mailu, takže heslo změní jen ten, kdo do ní vidí. Hláška „nick a e-mail
// k sobě nepatří“ by naopak komukoli prozradila, jaký e-mail má který (veřejný) nick.
// Místo toho se e-mail z přihlášení předvyplní a nové heslo ukazuje, o který účet jde.

import {
    requestPasswordReset, setNewPassword, isSignedIn, isRecoverySession, passwordProblem,
    getProfile, getUser, onAuthChange,
} from "../auth.js";
import { navigate } from "../router.js";
import { PASSWORD_MIN_LENGTH } from "../config.js";
import { setAccent } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { createCaptcha, captchaErrorText } from "../captcha.js";
import { h, mount, toast } from "../dom.js";
import { field, lastLoginInput } from "./login.js";

/** Text chyby hesla podle kódu (stejná pravidla jako v databázi). */
export function passwordErrorText(code, fallback) {
    if (code === "errorPasswordShort") return format("errorPasswordShort", PASSWORD_MIN_LENGTH);
    if (code === "errorPasswordWeak" || code === "weak_password") return TEXTS.errorPasswordWeak;
    if (code === "same_password") return TEXTS.errorPasswordSame;
    if (code === "wrong_password") return TEXTS.errorPasswordWrong;
    if (code === "rate_limited") return TEXTS.resendRateLimited;
    if (code === "captcha_unavailable") return TEXTS.errorCaptchaUnavailable;
    if (code === "captcha_failed" || code === "captcha_timeout") return TEXTS.errorCaptcha;
    return fallback;
}

/** #/forgot – e-mail → odkaz pro nové heslo. */
export function forgotPasswordView(container) {
    setAccent(null);
    document.title = `${TEXTS.forgotTitle} · ${TEXTS.appName}`;

    // Z přihlášení: e-mail se předvyplní; u nicku jen připomínka, ať zadá e-mail toho účtu
    const typed = lastLoginInput;
    const email = h("input", { type: "email", name: "email", required: true, autocomplete: "email",
        value: typed.includes("@") ? typed : "" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, TEXTS.forgotSubmit);
    const captcha = createCaptcha();       // ochrana proti robotům (V2.6)

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h1", {}, TEXTS.forgotTitle),
        h("p", { class: "muted" }, TEXTS.forgotIntro),
        typed && !typed.includes("@") ? h("p", { class: "notice" }, format("forgotNicknameNote", typed)) : null,
        field(TEXTS.email, email, TEXTS.forgotEmailHint),
        h("p", { class: "hint" }, TEXTS.forgotOnlyInbox),
        captcha.element,
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
            const captchaToken = await captcha.token();
            await requestPasswordReset(address, captchaToken);
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
            error.textContent = captchaErrorText(e) ?? passwordErrorText(e.code, format("errorGeneric", e.message));
            submit.disabled = false;
            captcha.reset();        // token platí jen jednou
        }
    }
}

/**
 * Rámeček „Account: nick · e-mail“ – ať je jasné, kterému účtu se heslo mění (V2.6).
 * Profil se po návratu z odkazu může načítat ještě chvíli – nick se pak doplní.
 */
function accountBox() {
    const name = h("strong", { class: "account-box__name" }, getProfile()?.username ?? "…");
    const box = h("div", { class: "account-box" },
        h("span", { class: "account-box__label" }, TEXTS.resetForAccount),
        name,
        h("span", { class: "account-box__email" }, getUser()?.email ?? ""));
    const stop = onAuthChange((state) => {
        if (!box.isConnected) return stop();          // obrazovka už je pryč
        if (state.profile) name.textContent = state.profile.username;
    });
    return box;
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
        accountBox(),
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
