// Tlačítko ☰ „Add to list“ u filmu (V3.5.3; společné pro kolekci, seznam a hledání od V3.6.2).
// Okno s výběrem seznamu (list-picker.js) se načte až po prvním kliknutí.

import { TEXTS } from "../texts.js";
import { h } from "../dom.js";

export function listButton(film) {
    return h("button", {
        class: "star-btn list-btn", type: "button",
        title: TEXTS.listAddTo, "aria-label": `${TEXTS.listAddTo}: ${film.title}`,
        onClick: async () => {
            const { openListPicker } = await import("./list-picker.js");
            openListPicker(film);
        },
    }, "☰");
}
