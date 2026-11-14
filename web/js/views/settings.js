// Obrazovka: nastavení (V4.0) – vzhled a výchozí pořadí pro každého, pro přihlášené i účet:
// nick, veřejný profil, heslo, instalace aplikace, smazání účtu a odhlášení.
// (Do V3.6 bylo nastavení účtu pod achievementy v profilu.)

import {
    getUser, getProfile, isSignedIn, updateUsername, isUsernameAvailable, hasGeneratedUsername, signOut,
    setProfilePublic, isUsernameAllowed, deleteMyAccount, signOutLocal,
    changePassword, hasPassword, passwordProblem,
} from "../auth.js";
import { passwordErrorText } from "./password.js";
import { createCaptcha, captchaErrorText } from "../captcha.js";
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from "../config.js";
import { profileUrl, shareProfile } from "../social.js";
import { navigate } from "../router.js";
import { TEXTS, format } from "../texts.js";
import { setAccent } from "../theme.js";
import { loadPref, savePref } from "../prefs.js";
import { h, mount, toast } from "../dom.js";
import { field } from "./login.js";
import { canInstall, promptInstall, isStandalone, isIos } from "../pwa.js";
import { profileTabs } from "./stats.js";
import { appearanceControls } from "./appearance.js";

export async function settingsView(container) {
    setAccent(null);
    document.title = `${TEXTS.settingsTitle} · ${TEXTS.appName}`;
    const signedIn = isSignedIn();
    const generated = signedIn && hasGeneratedUsername();

    mount(container,
        signedIn ? profileTabs("settings") : null,
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, TEXTS.appName),
            h("h1", {}, TEXTS.settingsTitle)),
        // Kdo má ještě automatický nick (Google), vidí nejdřív volbu nicku
        generated ? nicknameCard() : null,
        h("div", { class: "settings-layout" },
            settingsSection(TEXTS.settingsAppearance, TEXTS.settingsAppearanceHint, appearanceControls()),
            settingsSection(TEXTS.settingsPreferences, null, defaultsControls(signedIn))),
        signedIn
            ? h("section", { class: "settings-account" },
                h("h2", { class: "settings-account__title" }, TEXTS.settingsAccount),
                h("div", { class: "auth-page auth-page--stack" },
                    generated ? null : nicknameCard(),
                    publicProfileCard(),
                    changePasswordCard(),
                    installCard(),
                    signOutCard(),
                    deleteAccountCard()))
            : h("section", { class: "settings-account" },
                h("div", { class: "auth-page auth-page--stack" },
                    installCard(),
                    h("section", { class: "auth-form" },
                        h("h2", {}, TEXTS.settingsAccount),
                        h("p", { class: "muted" }, TEXTS.settingsGuestText),
                        h("div", { class: "settings-actions" },
                            h("a", { class: "btn btn--primary", href: "#/login" }, TEXTS.navSignIn),
                            h("a", { class: "btn", href: "#/register" }, TEXTS.navRegister))))),
    );
    if (generated) container.querySelector("input[name=username]")?.focus();
}

/** Karta s nadpisem a popiskem pro skupinu voleb. */
function settingsSection(title, hint, content) {
    return h("section", { class: "settings-card" },
        h("h2", { class: "settings-card__title" }, title),
        hint ? h("p", { class: "muted settings-card__hint" }, hint) : null,
        content);
}

/**
 * Výchozí pořadí filmů v kolekci a řazení přehledu – stejné volby jako přímo na těch
 * stránkách (prefs.js), tady jen na jednom místě.
 */
function defaultsControls(signedIn) {
    const select = (label, key, options, fallback) => {
        const current = loadPref(key, fallback);
        const element = h("select", { class: "admin-input", "aria-label": label,
            onChange: (event) => savePref(key, event.target.value) },
            options.map(([value, text]) => h("option", { value, selected: value === current }, text)));
        return h("label", { class: "settings-field" }, h("span", { class: "setting__legend" }, label), element);
    };
    return h("div", { class: "settings-group" },
        select(TEXTS.settingsOrder, "order", [
            ["release", TEXTS.orderRelease], ["story", TEXTS.orderStory], ["groups", TEXTS.orderGroups],
        ], "release"),
        select(TEXTS.settingsSort, "sort", [
            ["alpha", TEXTS.sort_alpha], ["newest", TEXTS.sort_newest],
            ...(signedIn ? [["progress", TEXTS.sort_progress]] : []),
        ], "alpha"));
}

/** Karta „Nickname“ – změna nicku (hlavně pro uživatele přihlášené přes Google). */
function nicknameCard() {
    const profile = getProfile();
    const generated = hasGeneratedUsername();

    const username = h("input", {
        type: "text", name: "username", required: true, maxlength: 24, spellcheck: "false",
        autocomplete: "username",
        value: generated ? "" : (profile?.username ?? ""),
        placeholder: generated ? profile?.username : null,
    });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, TEXTS.profileSave);

    return h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h2", {}, TEXTS.username),
        h("p", { class: "muted" }, format("profileIntro", getUser()?.email ?? "")),
        profile?.is_admin ? h("span", { class: "badge badge--accent" }, TEXTS.profileAdmin) : null,
        generated ? h("p", { class: "notice" }, TEXTS.profileChooseNickname) : null,
        field(TEXTS.username, username, TEXTS.usernameHint),
        error,
        submit,
    );

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        const name = username.value.trim();

        if (!USERNAME_PATTERN.test(name)) {
            error.textContent = TEXTS.errorUsernameFormat;
            return;
        }
        if (name === getProfile()?.username) return;

        submit.disabled = true;
        try {
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
            const wasGenerated = hasGeneratedUsername();
            await updateUsername(name);
            toast(TEXTS.profileSaved);
            // Nový uživatel z Googlu pokračuje do aplikace, ostatní zůstávají v nastavení
            if (wasGenerated) navigate("/");
            else submit.disabled = false;
        } catch (e) {
            error.textContent = e.code === "username_not_allowed" ? TEXTS.errorUsernameNotAllowed : e.message;
            submit.disabled = false;
        }
    }
}

/** Karta „Sign out“ (V4.0 – dřív tlačítko v hlavičce). */
function signOutCard() {
    return h("section", { class: "auth-form" },
        h("h2", {}, TEXTS.navSignOut),
        h("p", { class: "muted" }, TEXTS.settingsSignOutText),
        h("button", {
            class: "btn btn--block", type: "button",
            onClick: async () => {
                try {
                    await signOut();
                    toast(TEXTS.signedOut);
                    navigate("/");
                } catch (e) {
                    toast(format("errorGeneric", e.message), "error");
                }
            },
        }, TEXTS.navSignOut));
}

/**
 * Karta „Public profile“: přepínač viditelnosti, odkaz ke sdílení a náhled.
 * Překreslí se sama po změně (bez nového načtení stránky).
 */
function publicProfileCard() {
    const card = h("section", { class: "public-card" });

    function render() {
        const profile = getProfile();
        const isPublic = Boolean(profile?.is_public);
        const blocked = hasGeneratedUsername();     // nejdřív vlastní nick, pak sdílení

        const toggle = h("button", {
            class: "switch", type: "button", role: "switch",
            "aria-checked": String(isPublic), disabled: blocked,
            onClick: async () => {
                toggle.disabled = true;
                try {
                    await setProfilePublic(!isPublic);
                    toast(isPublic ? TEXTS.publicMadePrivate : TEXTS.publicMadePublic);
                } catch (error) {
                    toast(format("errorGeneric", error.message), "error");
                }
                render();
            },
        }, h("span", { class: "switch__track", "aria-hidden": "true" }), TEXTS.publicToggle);

        const url = profile ? profileUrl(profile.username) : "";
        mount(card,
            h("div", { class: "public-card__head" },
                h("div", {},
                    h("h2", { class: "public-card__title" }, `🌐 ${TEXTS.publicCardTitle}`),
                    h("p", { class: "muted public-card__text" }, blocked ? TEXTS.publicNeedsNickname : TEXTS.publicCardText)),
                toggle),
            isPublic
                ? h("div", { class: "public-card__link" },
                    h("input", { class: "admin-input admin-input--grow", type: "text", value: url, readonly: true,
                        "aria-label": TEXTS.publicLinkLabel, onFocus: (e) => e.target.select() }),
                    h("button", {
                        class: "btn btn--primary btn--small", type: "button",
                        onClick: async () => {
                            try {
                                const result = await shareProfile(profile.username, format("publicShareTitle", profile.username));
                                if (result === "copied") toast(TEXTS.publicLinkCopied);
                            } catch (error) {
                                toast(format("errorGeneric", error.message), "error");
                            }
                        },
                    }, `↗ ${TEXTS.publicShare}`),
                    h("a", { class: "btn btn--small", href: `#/u/${encodeURIComponent(profile.username)}` }, TEXTS.publicView))
                : null,
        );
    }

    render();
    return card;
}

/**
 * Karta „Change password“ (V2.5). Účet s heslem zadá současné heslo; účet jen z Googlu
 * si heslo nastaví poprvé (pak se může přihlásit i e-mailem).
 */
function changePasswordCard() {
    const withPassword = hasPassword();
    const current = withPassword
        ? h("input", { type: "password", name: "current-password", autocomplete: "current-password" })
        : null;
    const next = h("input", { type: "password", name: "new-password", autocomplete: "new-password" });
    const repeat = h("input", { type: "password", name: "new-password-repeat", autocomplete: "new-password" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" },
        withPassword ? TEXTS.changePasswordSubmit : TEXTS.setPasswordSubmit);
    // Ověření současného hesla je přihlášení → chce CAPTCHA (V2.6). Načte se až při
    // prvním kliknutí do karty – většina návštěv profilu heslo nemění.
    const captcha = withPassword ? createCaptcha({ lazy: true }) : null;

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h2", {}, withPassword ? TEXTS.changePasswordTitle : TEXTS.setPasswordTitle),
        withPassword ? null : h("p", { class: "muted" }, TEXTS.setPasswordText),
        current ? field(TEXTS.currentPassword, current) : null,
        field(TEXTS.newPassword, next, format("passwordHintRules", PASSWORD_MIN_LENGTH)),
        field(TEXTS.passwordRepeat, repeat),
        captcha?.element,
        error,
        submit,
    );
    if (captcha) form.addEventListener("focusin", captcha.prepare, { once: true });
    return form;

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        if (current && !current.value) {
            error.textContent = TEXTS.errorPasswordWrong;
            return;
        }
        const problem = passwordProblem(next.value);
        if (problem) {
            error.textContent = passwordErrorText(problem);
            return;
        }
        if (next.value !== repeat.value) {
            error.textContent = TEXTS.errorPasswordMismatch;
            return;
        }
        submit.disabled = true;
        try {
            const captchaToken = captcha ? await captcha.token() : undefined;
            await changePassword({ current: current?.value, next: next.value, captchaToken });
            toast(TEXTS.passwordChanged);
            form.reset();
        } catch (e) {
            error.textContent = captchaErrorText(e) ?? passwordErrorText(e.code, format("errorGeneric", e.message));
        } finally {
            captcha?.reset();      // token platí jen jednou
        }
        submit.disabled = false;
    }
}

/**
 * Karta „Delete account“ (V2.3): smazání účtu po opsání vlastního nicku.
 * Správce místo tlačítka vidí vysvětlení (nejdřív musí předat roli).
 */
function deleteAccountCard() {
    const profile = getProfile();
    const card = h("section", { class: "auth-form danger-card" }, h("h2", {}, TEXTS.deleteTitle));

    if (profile?.is_admin) {
        card.append(h("p", { class: "muted" }, TEXTS.deleteAdmin));
        return card;
    }

    const confirm = h("input", {
        type: "text", autocomplete: "off", spellcheck: "false",
        placeholder: profile?.username ?? "", "aria-label": TEXTS.deleteConfirmLabel,
    });
    const button = h("button", { class: "btn btn--block btn--danger", type: "button", disabled: true }, TEXTS.deleteButton);
    confirm.addEventListener("input", () => {
        button.disabled = confirm.value.trim() !== (getProfile()?.username ?? "\u0000");
    });
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            await deleteMyAccount();
            navigate("/");                 // nejdřív pryč z profilu, ať po odhlášení nepřesměruje na login
            await signOutLocal();
            toast(TEXTS.deleteDone);
        } catch (e) {
            toast(e.code === "admin_cannot_delete" ? TEXTS.deleteAdmin : format("errorGeneric", e.message), "error");
            button.disabled = false;
        }
    });

    card.append(
        h("p", { class: "muted" }, TEXTS.deleteText),
        field(TEXTS.deleteConfirmLabel, confirm),
        button,
    );
    return card;
}

/** Karta „Install the app“ – tlačítko, návod pro iPhone, nebo potvrzení. */
function installCard() {
    let body;
    if (isStandalone()) {
        body = h("p", { class: "muted" }, TEXTS.installDone);
    } else if (canInstall()) {
        body = h("button", {
            class: "btn btn--primary btn--block", type: "button",
            onClick: async () => {
                if (await promptInstall()) toast(TEXTS.installThanks);
            },
        }, `⤓ ${TEXTS.installButton}`);
    } else {
        body = h("p", { class: "muted" }, isIos() ? TEXTS.installIos : TEXTS.installOther);
    }
    return h("section", { class: "auth-form install-card" },
        h("h2", {}, TEXTS.installTitle),
        isStandalone() ? null : h("p", {}, TEXTS.installText),
        body,
    );
}
