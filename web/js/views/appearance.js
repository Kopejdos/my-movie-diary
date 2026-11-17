// Ovládání vzhledu (V4.0) – stejné prvky v okně ⚙ z hlavičky i na stránce Settings.
// Každá volba je skupina přepínačů (radio); změna se uloží a použije hned (settings.js).

import { SETTING_OPTIONS, getSettings, setSetting, onSettingsChange } from "../settings.js";
import { isSignedIn } from "../auth.js";
import { TEXTS, LANGUAGES } from "../texts.js";
import { h } from "../dom.js";
import { openModal } from "./modal.js";

let groupCounter = 0;

/**
 * Skupina přepínačů jako „segmented“ tlačítka.
 * @param {string} key klíč nastavení (mode, style…)
 * @param {string} legend nadpis skupiny
 * @param {object} [options] { swatches: true } = barevná kolečka (akcent)
 */
function choiceGroup(key, legend, { swatches = false, hint = null, wideOnly = false } = {}) {
    const name = `setting-${key}-${++groupCounter}`;
    const current = getSettings()[key];
    const options = SETTING_OPTIONS[key].map((value) => {
        const input = h("input", { class: "visually-hidden", type: "radio", name, value, checked: value === current });
        input.addEventListener("change", () => {
            if (input.checked) setSetting(key, value);
        });
        return h("label", {
            class: `${swatches ? "swatch" : "segmented__option"}${value === current ? " is-checked" : ""}`,
            "data-value": value,
        },
            input,
            swatches ? h("span", { class: `swatch__dot swatch__dot--${value}`, "aria-hidden": "true" }) : null,
            h("span", { class: swatches ? "swatch__name" : null }, TEXTS[`settings${capitalize(key)}_${value}`]));
    });
    // wideOnly: na telefonu se nezobrazuje (hustota – telefon má od V4.1.1 jednu, menší velikost)
    return h("fieldset", { class: wideOnly ? "setting setting--wide-only" : "setting" },
        h("legend", { class: "setting__legend" }, legend),
        h("div", { class: swatches ? "swatches" : "segmented segmented--choice" }, options),
        hint ? h("p", { class: "hint setting__hint" }, hint) : null);
}

const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

/** Výběr jazyka (V4.2) – názvy jazyků v daném jazyce; změna uloží volbu a načte aplikaci znovu. */
function languageSelect() {
    const current = getSettings().language;
    const select = h("select", {
        class: "admin-input settings-language", "aria-label": TEXTS.settingsLanguage,
        onChange: (event) => {
            setSetting("language", event.target.value);
            window.location.reload();
        },
    },
        h("option", { value: "auto", selected: current === "auto" }, TEXTS.settingsLanguage_auto),
        Object.entries(LANGUAGES).map(([code, name]) => h("option", { value: code, selected: current === code }, name)));
    return h("div", { class: "setting" },
        h("span", { class: "setting__legend" }, TEXTS.settingsLanguage),
        select,
        h("p", { class: "hint setting__hint" }, TEXTS.settingsLanguageHint));
}

/** Všechny volby vzhledu. Po změně (i z jiného místa) se označení samo přepne. */
export function appearanceControls() {
    const root = h("div", { class: "settings-group" },
        languageSelect(),
        choiceGroup("mode", TEXTS.settingsMode),
        choiceGroup("style", TEXTS.settingsStyle),
        choiceGroup("accent", TEXTS.settingsAccent, { swatches: true, hint: TEXTS.settingsAccentHint }),
        choiceGroup("density", TEXTS.settingsDensity, { wideOnly: true }),
        choiceGroup("motion", TEXTS.settingsMotion));

    const unsubscribe = onSettingsChange((settings) => {
        if (!root.isConnected) {
            unsubscribe();
            return;
        }
        root.querySelectorAll("fieldset").forEach((fieldset) => {
            fieldset.querySelectorAll("input[type=radio]").forEach((input) => {
                const key = input.name.split("-")[1];
                input.checked = settings[key] === input.value;
                input.parentElement.classList.toggle("is-checked", input.checked);
            });
        });
    });
    return root;
}

/** Okno ⚙ z hlavičky: vzhled + odkaz na celé nastavení. */
export function openAppearancePanel() {
    openModal({
        eyebrow: TEXTS.settingsTitle,
        title: TEXTS.settingsAppearance,
        className: "appearance-panel",
        content: [
            appearanceControls(),
            h("div", { class: "modal__foot" },
                h("a", { href: "#/settings" }, `${TEXTS.settingsAll} →`),
                isSignedIn() ? null : h("span", { class: "muted" }, TEXTS.settingsAppearanceHint)),
        ],
    });
}
