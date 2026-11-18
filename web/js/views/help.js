// Obrazovka: nápověda (#/help, V4.3.4) – co dělá které tlačítko, jak aplikace funguje, pravidla.
// „Take the tour again“ zapomene, že uživatel prohlídky viděl (js/guide.js), a přejde na přehled –
// prohlídka se tam spustí sama (views/guide.js).

import { resetSeen } from "../guide.js";
import { navigate } from "../router.js";
import { setAccent } from "../theme.js";
import { TEXTS } from "../texts.js";
import { h, mount } from "../dom.js";

/** Tlačítka v kostce: [ukázka tlačítka, text]. Ukázky vypadají jako tlačítka v aplikaci. */
function legend() {
    const sample = (className, content = "") => h("span", { class: `help-key__sample ${className}`, "aria-hidden": "true" }, content);
    const icon = (className) => h("span", { class: `help-key__sample help-key__sample--icon`, "aria-hidden": "true" },
        h("span", { class: className }));
    return [
        [sample("help-key__sample--add", "+"), TEXTS.helpKeyAdd],
        [sample("", "−"), TEXTS.helpKeyRemove],
        [sample("help-key__sample--star", "☆"), TEXTS.helpKeyStar],
        [sample("", "☰"), TEXTS.helpKeyList],
        [sample("help-key__sample--rate", "★"), TEXTS.helpKeyRate],
        [icon("search-icon"), TEXTS.helpKeySearch],
        [icon("calendar-icon"), TEXTS.helpKeySoon],
        [icon("request-icon"), TEXTS.helpKeyRequests],
        [icon("gear-icon"), TEXTS.helpKeySettings],
        [sample("help-key__sample--level", "9"), TEXTS.helpKeyLevel],
        [sample("help-key__sample--wide", `🧭 ${TEXTS.kindPathBadge}`), TEXTS.helpKeyPath],
        [sample("help-key__sample--wide", `🎬 ${TEXTS.kindDirectorBadge}`), TEXTS.helpKeyDirector],
        [sample("help-key__sample--wide", `✓ ${TEXTS.complete}`), TEXTS.helpKeyComplete],
    ];
}

/** Oddíly nápovědy: [nadpis, body]. */
const SECTIONS = [
    ["helpStartTitle", "helpStartItems"],
    ["helpSeenTitle", "helpSeenItems"],
    ["helpListsTitle", "helpListsItems"],
    ["helpLevelTitle", "helpLevelItems"],
    ["helpFriendsTitle", "helpFriendsItems"],
    ["helpRequestsTitle", "helpRequestsItems"],
    ["helpRulesTitle", "helpRulesItems"],
    ["helpAppTitle", "helpAppItems"],
];

export function helpView(container) {
    setAccent(null);
    document.title = `${TEXTS.helpTitle} · ${TEXTS.appName}`;

    const tourButton = h("button", {
        class: "btn btn--primary", type: "button",
        onClick: () => {
            resetSeen();
            navigate("/");
        },
    }, TEXTS.helpTourAgain);

    mount(container,
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, "?"),
            h("h1", {}, TEXTS.helpTitle),
            h("p", { class: "muted" }, TEXTS.helpIntro),
            h("div", { class: "help-tour" },
                tourButton,
                h("p", { class: "muted help-tour__hint" }, TEXTS.helpTourHint)),
        ),
        h("section", { class: "about-card help-keys" },
            h("h2", {}, TEXTS.helpKeysTitle),
            h("ul", { class: "help-keys__list" },
                legend().map(([sample, text]) => h("li", { class: "help-key" }, sample, h("span", {}, text))))),
        h("div", { class: "about-grid help-grid" },
            SECTIONS.map(([title, items]) => h("section", { class: "about-card" },
                h("h2", {}, TEXTS[title]),
                h("ul", { class: "about-list" }, TEXTS[items].map((item) => h("li", {}, item))),
                title === "helpRulesTitle" ? h("p", {}, h("a", { href: "terms.html#rules" }, TEXTS.helpRulesLink)) : null))),
    );
}
