// Obrazovka: o aplikaci (#/about) – co je My Movie Diary, kdo ho dělá, pravidla, kontakt.

import { APP_VERSION, APP_UPDATED, OPERATOR_NAME, CONTACT_EMAIL, GITHUB_URL, MIN_AGE } from "../config.js";
import { setAccent } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { h, mount } from "../dom.js";

export function aboutView(container) {
    setAccent(null);
    document.title = `${TEXTS.aboutTitle} · ${TEXTS.appName}`;

    const link = (href, label, external = false) => h("a", {
        href, target: external ? "_blank" : null, rel: external ? "noopener" : null,
    }, label);

    mount(container,
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, "🎬"),
            h("h1", {}, TEXTS.aboutTitle),
            h("p", { class: "muted" }, TEXTS.aboutIntro),
        ),
        h("div", { class: "about-grid" },
            card(TEXTS.aboutWhatTitle,
                h("p", {}, TEXTS.aboutWhatText),
                h("ul", { class: "about-list" }, TEXTS.aboutFeatures.map((f) => h("li", {}, f)))),
            card(TEXTS.aboutWhoTitle,
                h("p", {}, format("aboutWhoText", OPERATOR_NAME)),
                h("p", { class: "muted" }, TEXTS.aboutStack)),
            card(TEXTS.aboutRulesTitle,
                h("p", {}, format("aboutRulesText", MIN_AGE)),
                h("ul", { class: "about-list" }, TEXTS.aboutRules.map((r) => h("li", {}, r))),
                h("p", {}, link("terms.html#rules", TEXTS.aboutReadTerms))),
            card(TEXTS.aboutContactTitle,
                h("p", {}, TEXTS.aboutContactText),
                h("p", {}, link(`mailto:${CONTACT_EMAIL}`, CONTACT_EMAIL)),
                h("p", { class: "muted" }, TEXTS.aboutContactGithub, " ", link(`${GITHUB_URL}/issues`, "GitHub", true), ".")),
            card(TEXTS.aboutDataTitle,
                h("p", {}, TEXTS.aboutDataText),
                h("p", {}, link("privacy.html", TEXTS.aboutReadPrivacy))),
            card(TEXTS.aboutCreditsTitle,
                h("p", {}, TEXTS.aboutCreditsText),
                h("p", { class: "muted" }, TEXTS.tmdbAttribution),
                h("p", {},
                    h("strong", {}, `${APP_VERSION} · ${APP_UPDATED}`), " · ",
                    link(`${GITHUB_URL}/blob/main/CHANGELOG.md`, TEXTS.aboutChangelog, true))),
        ),
    );
}

/** Karta s nadpisem. */
function card(title, ...content) {
    return h("section", { class: "about-card" }, h("h2", {}, title), content);
}
