// Obrazovka: neexistující adresa.

import { TEXTS } from "../texts.js";
import { h, mount } from "../dom.js";

export async function notFoundView(container) {
    document.title = `${TEXTS.notFoundTitle} · ${TEXTS.appName}`;
    mount(container,
        h("div", { class: "state" },
            h("h1", {}, TEXTS.notFoundTitle),
            h("p", { class: "muted" }, TEXTS.notFoundText),
            h("a", { class: "btn", href: "#/" }, TEXTS.back),
        ),
    );
}
