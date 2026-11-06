// Obrazovka: přátelé (#/friends, V3.4.1) – přidání podle nicku, přijaté a odeslané žádosti,
// seznam přátel. Přátelství je vzájemné a nepotřebuje veřejný profil.
// Tlačítko přátelství (friendButton) používá i veřejný profil.

import {
    fetchFriends, sendFriendRequest, respondFriendRequest, removeFriend,
} from "../social.js";
import { isSignedIn, getProfile } from "../auth.js";
import { navigate } from "../router.js";
import { setAccent } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, toast, loadingView, errorView, formatDate } from "../dom.js";
import { profileTabs } from "./stats.js";

export async function friendsView(container, context) {
    setAccent(null);
    if (!isSignedIn()) {
        navigate("/login");
        return;
    }
    document.title = `${TEXTS.friendsTitle} · ${TEXTS.appName}`;
    mount(container, profileTabs("friends"), loadingView());

    let lists;
    try {
        lists = await fetchFriends();
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, profileTabs("friends"),
            errorView(format("errorGeneric", error.message), () => friendsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const body = h("div", { class: "friends" });
    const listsHost = h("div", { class: "friends__lists" });   // seznamy se překreslují, formulář zůstává
    const reload = async () => {
        try {
            lists = await fetchFriends();
            if (context.isCurrent()) render();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    };

    function render() {
        const { friends, incoming, outgoing } = lists;
        mount(listsHost,
            incoming.length > 0
                ? section(TEXTS.friendsRequests, incoming.length,
                    incoming.map((f) => personRow(f, format("friendsRequestedOn", formatDate(f.since?.slice(0, 10))),
                        requestActions(f.username, reload))), "friends__section--requests")
                : null,
            section(TEXTS.friendsListTitle, friends.length,
                friends.length > 0
                    ? friends.map((f) => personRow(f, format("friendsSince", formatDate(f.since?.slice(0, 10))),
                        removeAction(f.username, TEXTS.friendsRemove, TEXTS.friendsRemoveConfirm, reload), true))
                    : h("li", { class: "empty-filter" }, TEXTS.friendsEmpty)),
            outgoing.length > 0
                ? section(TEXTS.friendsSent, outgoing.length,
                    outgoing.map((f) => personRow(f, format("friendsSentOn", formatDate(f.since?.slice(0, 10))),
                        removeAction(f.username, TEXTS.friendsCancel, null, reload))))
                : null,
        );
    }

    mount(body, addFriendForm(reload), listsHost);
    render();
    mount(container,
        profileTabs("friends"),
        h("section", { class: "page-header" },
            h("h1", {}, TEXTS.friendsTitle),
            h("p", { class: "muted" }, TEXTS.friendsIntro),
        ),
        body,
    );
}

/** Formulář „Add friend“ – přesný nick (najde i soukromý účet). */
function addFriendForm(onDone) {
    const input = h("input", {
        type: "text", name: "friend", maxlength: 24, spellcheck: "false", autocomplete: "off",
        placeholder: TEXTS.friendsAddPlaceholder, "aria-label": TEXTS.friendsAddLabel,
    });
    const button = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.friendsAddButton);
    const message = h("p", { class: "friends-add__message", role: "status" });

    const form = h("form", {
        class: "friends-add", novalidate: true,
        onSubmit: async (event) => {
            event.preventDefault();
            const nick = input.value.trim().replace(/^@/, "");
            if (nick.length < 3) {
                showMessage(TEXTS.friendsAddTooShort, true);
                return;
            }
            button.disabled = true;
            try {
                const result = await sendFriendRequest(nick);
                const ok = result === "sent" || result === "accepted";
                showMessage(format(`friendsResult_${result}`, nick), !ok && result !== "already_friends" && result !== "already_sent");
                if (ok) {
                    input.value = "";
                    onDone();
                }
            } catch (error) {
                showMessage(format("errorGeneric", error.message), true);
            }
            button.disabled = false;
        },
    },
        h("h2", { class: "friends-add__title" }, TEXTS.friendsAddTitle),
        h("div", { class: "friends-add__row" }, h("span", { class: "friends-add__at", "aria-hidden": "true" }, "@"), input, button),
        message,
    );

    function showMessage(text, isError) {
        message.textContent = text;
        message.classList.toggle("friends-add__message--error", isError);
    }
    return form;
}

/** Sekce s nadpisem a počtem. */
function section(title, count, rows, extraClass = "") {
    return h("section", { class: `friends__section ${extraClass}` },
        h("h2", { class: "friends__title" }, title, h("span", { class: "friends__count" }, String(count))),
        h("ul", { class: "friends__list" }, rows),
    );
}

/** Řádek člověka: iniciála, @nick (odkaz na profil u přátel), datum a tlačítka. */
function personRow(person, meta, actions, linkProfile = false) {
    const name = linkProfile
        ? h("a", { class: "friend-row__name", href: `#/u/${encodeURIComponent(person.username)}` }, `@${person.username}`)
        : h("strong", { class: "friend-row__name" }, `@${person.username}`);
    return h("li", { class: "friend-row" },
        h("span", { class: "user-result__avatar", "aria-hidden": "true" }, person.username.charAt(0).toUpperCase()),
        h("span", { class: "friend-row__info" }, name, h("span", { class: "muted" }, meta)),
        h("span", { class: "friend-row__actions" }, actions),
    );
}

/** Přijmout / odmítnout žádost. */
function requestActions(username, onDone) {
    const accept = h("button", { class: "btn btn--small btn--primary", type: "button" }, TEXTS.friendsAccept);
    const decline = h("button", { class: "btn btn--small", type: "button" }, TEXTS.friendsDecline);
    const act = async (yes) => {
        accept.disabled = decline.disabled = true;
        try {
            await respondFriendRequest(username, yes);
            toast(format(yes ? "friendsAccepted" : "friendsDeclined", username));
            onDone();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            accept.disabled = decline.disabled = false;
        }
    };
    accept.addEventListener("click", () => act(true));
    decline.addEventListener("click", () => act(false));
    return [accept, decline];
}

/**
 * Odebrání přítele / zrušení žádosti. S potvrzením (confirmLabel) jde o dvoukrokové tlačítko
 * přímo v řádku – žádné okno prohlížeče.
 */
function removeAction(username, label, confirmLabel, onDone) {
    const wrap = h("span", { class: "friend-row__confirm" });
    const run = async (button) => {
        button.disabled = true;
        try {
            await removeFriend(username);
            toast(format(confirmLabel ? "friendsRemoved" : "friendsCanceled", username));
            onDone();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            button.disabled = false;
        }
    };
    const first = () => {
        const button = h("button", { class: "btn btn--small", type: "button" }, label);
        button.addEventListener("click", () => (confirmLabel ? ask() : run(button)));
        mount(wrap, button);
    };
    const ask = () => {
        const yes = h("button", { class: "btn btn--small btn--danger", type: "button" }, confirmLabel);
        const no = h("button", { class: "btn btn--small", type: "button" }, TEXTS.friendsKeep);
        yes.addEventListener("click", () => run(yes));
        no.addEventListener("click", first);
        mount(wrap, yes, no);
        yes.focus();
    };
    first();
    return wrap;
}

/**
 * Tlačítko přátelství na profilu podle stavu (none / outgoing / incoming / friend).
 * onChange(nový stav) – profil se podle něj může načíst znovu (přítel vidí i soukromá data).
 * Nepřihlášený a vlastní profil → null.
 */
export function friendButton(username, state, onChange) {
    if (!isSignedIn() || state === "self") return null;
    const own = getProfile();
    if (own && own.username.toLowerCase() === username.toLowerCase()) return null;

    const wrap = h("div", { class: "friend-button" });
    const busy = (on) => wrap.querySelectorAll("button").forEach((b) => { b.disabled = on; });
    const change = (next) => {
        state = next;
        render();
        onChange?.(next);
    };

    async function send() {
        busy(true);
        try {
            const result = await sendFriendRequest(username);
            if (result === "sent" || result === "already_sent") {
                toast(format("friendsResult_sent", username));
                change("outgoing");
            } else if (result === "accepted" || result === "already_friends") {
                toast(format("friendsAccepted", username));
                change("friend");
            } else {
                toast(format(`friendsResult_${result}`, username), "error");
                busy(false);
            }
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            busy(false);
        }
    }

    async function respond(accept) {
        busy(true);
        try {
            await respondFriendRequest(username, accept);
            toast(format(accept ? "friendsAccepted" : "friendsDeclined", username));
            change(accept ? "friend" : "none");
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            busy(false);
        }
    }

    async function remove(toast_key) {
        busy(true);
        try {
            await removeFriend(username);
            toast(format(toast_key, username));
            change("none");
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            busy(false);
        }
    }

    function button(label, className, onClick) {
        return h("button", { class: `btn ${className}`, type: "button", onClick }, label);
    }

    function render() {
        if (state === "friend") {
            mount(wrap, button(`✓ ${TEXTS.friendsIsFriend}`, "btn--friend", askRemove));
        } else if (state === "outgoing") {
            mount(wrap,
                h("span", { class: "friend-button__note" }, `⏳ ${TEXTS.friendsRequestSent}`),
                button(TEXTS.friendsCancel, "btn--small", () => remove("friendsCanceled")));
        } else if (state === "incoming") {
            mount(wrap,
                h("span", { class: "friend-button__note" }, format("friendsWantsToBe", username)),
                button(TEXTS.friendsAccept, "btn--primary", () => respond(true)),
                button(TEXTS.friendsDecline, "", () => respond(false)));
        } else {
            mount(wrap, button(`+ ${TEXTS.friendsAddButton}`, "btn--primary", send));
        }
    }

    function askRemove() {
        mount(wrap,
            h("span", { class: "friend-button__note" }, format("friendsRemoveQuestion", username)),
            button(TEXTS.friendsRemoveConfirm, "btn--danger", () => remove("friendsRemoved")),
            button(TEXTS.friendsKeep, "", render));
        wrap.querySelector(".btn--danger")?.focus();
    }

    render();
    return wrap;
}
