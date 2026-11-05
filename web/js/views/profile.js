// Obrazovka: profil – změna nicku (hlavně pro uživatele přihlášené přes Google).

import {
    getUser, getProfile, isSignedIn, updateUsername, isUsernameAvailable, hasGeneratedUsername, signOut,
    setProfilePublic,
} from "../auth.js";
import { profileUrl, shareProfile } from "../social.js";
import { navigate } from "../router.js";
import { USERNAME_PATTERN } from "../config.js";
import { TEXTS, format } from "../texts.js";
import { setAccent } from "../theme.js";
import { h, mount, toast } from "../dom.js";
import { field } from "./login.js";
import { canInstall, promptInstall, isStandalone, isIos } from "../pwa.js";
import { achievementsSection } from "./achievements.js";
import { profileTabs } from "./stats.js";

export async function profileView(container) {
    setAccent(null);
    if (!isSignedIn()) {
        navigate("/login");
        return;
    }
    document.title = `${TEXTS.profileTitle} · ${TEXTS.appName}`;

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

    const form = h("form", { class: "auth-form", novalidate: true, onSubmit: handleSubmit },
        h("h1", {}, TEXTS.profileTitle),
        h("p", { class: "muted" }, format("profileIntro", getUser()?.email ?? "")),
        profile?.is_admin ? h("span", { class: "badge badge--accent" }, TEXTS.profileAdmin) : null,
        generated ? h("p", { class: "notice" }, TEXTS.profileChooseNickname) : null,
        field(TEXTS.username, username, TEXTS.usernameHint),
        error,
        submit,
        h("div", { class: "divider" }),
        h("button", {
            class: "btn btn--block btn--danger", type: "button",
            onClick: async () => {
                try {
                    await signOut();
                    toast(TEXTS.signedOut);
                    navigate("/");
                } catch (e) {
                    toast(format("errorGeneric", e.message), "error");
                }
            },
        }, TEXTS.navSignOut),
    );

    // Achievementy nahoře; kdo má ještě automatický nick (Google), vidí nejdřív volbu nicku
    const settings = h("div", { class: "auth-page auth-page--stack" }, form, installCard());
    mount(container,
        generated ? settings : null,
        profileTabs("profile"),
        publicProfileCard(),
        achievementsSection(),
        generated ? null : settings,
    );
    if (generated) username.focus();

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        const name = username.value.trim();

        if (!USERNAME_PATTERN.test(name)) {
            error.textContent = TEXTS.errorUsernameFormat;
            return;
        }
        if (name === getProfile()?.username) {
            navigate("/");
            return;
        }

        submit.disabled = true;
        try {
            if (!(await isUsernameAvailable(name))) {
                error.textContent = TEXTS.errorUsernameTaken;
                submit.disabled = false;
                return;
            }
            await updateUsername(name);
            toast(TEXTS.profileSaved);
            navigate("/");
        } catch (e) {
            error.textContent = e.message;
            submit.disabled = false;
        }
    }
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
