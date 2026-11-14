// Obrazovka: veřejný profil uživatele (#/u/<nick>) – funguje i pro nepřihlášené.
// Achievementy a statistiky se počítají stejně jako na vlastním profilu,
// jen ze zhlédnutí, která vrátí funkce public_profile.
// Přátelé (V3.4.1): tlačítko Add friend / Accept / ✓ Friends; přítel vidí i soukromý profil,
// cizí soukromý profil ukáže jen nick a tlačítko přátelství.
// Seznamy (V3.5.3): záložka Lists – seznamy, které smím vidět (veřejné, u přítele i „friends“).

import { fetchPublicProfile, shareProfile } from "../social.js";
import { computeAchievements } from "../achievements.js";
import { computeStats } from "../stats.js";
import { todayLocal } from "../data.js";
import { getProfile, isSignedIn } from "../auth.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies, collections } from "../texts.js";
import { h, mount, toast, loadingView, errorView } from "../dom.js";
import { achievementsContent } from "./achievements.js";
import { statsContent } from "./stats.js";
import { friendButton } from "./friends.js";
import { fetchUserLists } from "../lists.js";
import { listGrid } from "./lists.js";

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
                isOwn ? h("a", { class: "btn btn--primary", href: "#/settings" }, TEXTS.publicOpenSettings) : null));
        return;
    }

    // Cizí soukromý profil (přihlášený uživatel) – jen nick a přátelství, žádná data
    const reload = () => publicProfileView(container, context);
    if (found.private) {
        mount(container,
            h("a", { class: "back-link", href: "#/" }, TEXTS.back),
            h("section", { class: "profile-hero profile-hero--private" },
                h("div", { class: "profile-hero__avatar", "aria-hidden": "true" }, found.profile.username.charAt(0).toUpperCase()),
                h("div", { class: "profile-hero__body" },
                    h("span", { class: "eyebrow" }, `🔒 ${TEXTS.friendsPrivateEyebrow}`),
                    h("h1", { class: "profile-hero__name" }, `@${found.profile.username}`),
                    h("p", { class: "muted profile-hero__meta" }, TEXTS.friendsPrivateText),
                    h("div", { class: "profile-hero__actions" },
                        // Po přijetí přátelství se profil načte znovu – přítel už data uvidí
                        friendButton(found.profile.username, found.friendship, (state) => { if (state === "friend") reload(); })),
                ),
            ),
            // Veřejné seznamy jsou vidět i u soukromého profilu (V3.5.3)
            userListsSection(found.profile.username, false, true));
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
            option("stats", TEXTS.profileTabStats),
            option("lists", TEXTS.profileTabLists)));

        if (tab === "lists") {
            mount(body, userListsSection(profile.username, isOwn));
        } else if (tab === "stats") {
            mount(body, stats.totals.watches > 0
                ? statsContent(stats)
                : h("div", { class: "empty-filter" }, TEXTS.publicNoActivity));
        } else {
            mount(body, achievementsContent(achievements));
        }
    }

    mount(container,
        profileHero(profile, achievements.level, stats.totals, isOwn, found.friendship, reload),
        tabs,
        body,
    );
    renderTabs();
}

/** Hlavička profilu: iniciála, nick, úroveň, členství a sdílení. */
function profileHero(profile, level, totals, isOwn, friendship, reload) {
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
                // Soukromý profil přítele: odkaz by ostatním nic neukázal – sdílení se schová
                profile.isPublic ? share : null,
                isOwn ? h("a", { class: "btn", href: "#/settings" }, TEXTS.publicEdit) : null,
                // Porovnání (V3.4.2) – přihlášený u cizího profilu, který vidí
                !isOwn && isSignedIn()
                    ? h("a", { class: "btn", href: `#/compare/${encodeURIComponent(profile.username)}` }, `⇄ ${TEXTS.compareButton}`)
                    : null,
                // Po zrušení přátelství se soukromý profil přítele schová – načíst znovu
                isOwn ? null : friendButton(profile.username, friendship, (state) => { if (state === "none") reload(); })),
        ),
    );
}

/**
 * Seznamy uživatele, které smím vidět (V3.5.3) – načtou se samy.
 * quiet = když žádný není, nic neukazovat (soukromý profil).
 */
function userListsSection(username, isOwn, quiet = false) {
    const section = h("section", { class: "public-lists" }, quiet ? null : loadingView());
    fetchUserLists(username)
        .then((lists) => {
            if (lists.length === 0) {
                mount(section, quiet ? null : h("div", { class: "empty-filter" },
                    isOwn ? TEXTS.listsEmpty : TEXTS.publicNoLists));
                return;
            }
            mount(section,
                quiet ? h("div", { class: "section-title" }, h("h2", {}, TEXTS.profileTabLists)) : null,
                listGrid(lists, { showVisibility: isOwn }),
                isOwn ? h("p", { class: "hint" }, h("a", { href: "#/lists" }, TEXTS.listManage)) : null);
        })
        .catch((error) => mount(section, quiet ? null : h("p", { class: "muted" }, format("errorGeneric", error.message))));
    return section;
}
