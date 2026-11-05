// Obrazovka: profil – změna nicku (hlavně pro uživatele přihlášené přes Google).

import {
    getUser, getProfile, isSignedIn, updateUsername, isUsernameAvailable, hasGeneratedUsername, signOut,
} from "../auth.js";
import { navigate } from "../router.js";
import { USERNAME_PATTERN } from "../config.js";
import { TEXTS, format } from "../texts.js";
import { setAccent } from "../theme.js";
import { h, mount, toast } from "../dom.js";
import { field } from "./login.js";

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

    mount(container, h("div", { class: "auth-page" }, form));
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
