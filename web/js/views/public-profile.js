// Obrazovka: veřejný profil uživatele (#/u/<nick>) – funguje i pro nepřihlášené.
// Achievementy a statistiky se počítají stejně jako na vlastním profilu,
// jen ze zhlédnutí, která vrátí funkce public_profile.

import { fetchPublicProfile, shareProfile } from "../social.js";
import { computeAchievements } from "../achievements.js";
import { computeStats } from "../stats.js";
import { todayLocal } from "../data.js";
import { getProfile } from "../auth.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies, collections } from "../texts.js";
import { h, mount, toast, loadingView, errorView } from "../dom.js";
import { achievementsContent } from "./achievements.js";
import { statsContent } from "./stats.js";

export async function publicProfileView(container, context) {
    const { params, isCurrent } = context;
    setAccent(null);
    document.title = `@${params.username} · ${TEXTS.appName}`;
    mount(container, loadingView());

    let found;
    try {
        found = await fetchPublicProfile(params.username);
    } catch (error) {
        if (!isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message), () => publicProfileView(container, context)));
        return;
    }
    if (!isCurrent()) return;

    const own = getProfile();
    const isOwn = own && own.username.toLowerCase() === params.username.toLowerCase();

    // Neexistuje, nebo je soukromý – navenek se neliší
    if (!found) {
        mount(container,
            h("a", { class: "back-link", href: "#/" }, TEXTS.back),
            h("div", { class: "state" },
                h("p", {}, isOwn ? TEXTS.publicOwnPrivate : TEXTS.publicNotFound),
                isOwn ? h("a", { class: "btn btn--primary", href: "#/profile" }, TEXTS.publicOpenSettings) : null));
        return;
    }

    const { profile, data } = found;
    const achievements = computeAchievements(data);
    const stats = computeStats(data, todayLocal());
    document.title = `@${profile.username} · ${TEXTS.appName}`;

    // Přepínač Achievements | Stats v rámci stránky (adresa se nemění)
    let tab = "achievements";
    const body = h("div", { class: "public-body" });
    const tabs = h("div", { class: "profile-tabs" });

    function renderTabs() {
        const option = (key, label) => h("button", {
            class: `segmented__option${tab === key ? " segmented__option--active" : ""}`,
            type: "button", "aria-pressed": String(tab === key),
            onClick: () => {
                tab = key;
                renderTabs();
            },
        }, label);
        mount(tabs, h("div", { class: "segmented" },
            option("achievements", TEXTS.profileTabAchievements),
            option("stats", TEXTS.profileTabStats)));

        if (tab === "stats") {
            mount(body, stats.totals.watches > 0
                ? statsContent(stats)
                : h("div", { class: "empty-filter" }, TEXTS.publicNoActivity));
        } else {
            mount(body, achievementsContent(achievements));
        }
    }

    mount(container,
        profileHero(profile, achievements.level, stats.totals, isOwn),
        tabs,
        body,
    );
    renderTabs();
}

/** Hlavička profilu: iniciála, nick, úroveň, členství a sdílení. */
function profileHero(profile, level, totals, isOwn) {
    const share = h("button", { class: "btn btn--primary", type: "button" }, `↗ ${TEXTS.publicShare}`);
    share.addEventListener("click", async () => {
        try {
            const result = await shareProfile(profile.username, format("publicShareTitle", profile.username));
            if (result === "copied") toast(TEXTS.publicLinkCopied);
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    });

    return h("section", { class: "profile-hero" },
        h("div", { class: "profile-hero__avatar", "aria-hidden": "true" }, profile.username.charAt(0).toUpperCase()),
        h("div", { class: "profile-hero__body" },
            h("span", { class: "eyebrow" }, format("levelLabel", level.level), " · ", level.title),
            h("h1", { class: "profile-hero__name" }, `@${profile.username}`),
            h("p", { class: "muted profile-hero__meta" },
                format("publicMemberSince", new Date(profile.memberSince).toLocaleDateString("en-GB", { month: "long", year: "numeric" })),
                " · ",
                format("publicSummary", movies(totals.films), collections(totals.completed))),
            h("div", { class: "profile-hero__actions" },
                share,
                isOwn ? h("a", { class: "btn", href: "#/profile" }, TEXTS.publicEdit) : null),
        ),
    );
}
