// Průvodce pro nováčky (V4.3.4) – vykreslení prohlídky: ztmavená stránka se „světlem“ na tlačítku,
// o kterém je řeč, a kartička s vysvětlením (krok 2 / 9, Back, Next, Skip tour).
// Kroky a zapamatování jsou v js/guide.js. Ovládání: Enter / → další, ← zpět, Esc ukončí.
// Kartička je dialog (aria-modal) – fokus zůstává v ní a po konci se vrátí, kde byl.

import { TOURS, stepsFor, markSeen } from "../guide.js";
import { getUser } from "../auth.js";
import { navigate, currentPath } from "../router.js";
import { TEXTS } from "../texts.js";
import { h, mount } from "../dom.js";

const GAP = 8;                  // okraj světla kolem prvku
const MARGIN = 16;              // od kraje obrazovky
let running = null;             // běžící prohlídka (jen jedna najednou)

/** Je prvek vidět? (ne display:none, ne schovaný na telefonu / počítači) */
function visible(element) {
    if (!element || element.getClientRects().length === 0) return false;
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none";
}

/** Cíl kroku: první viditelný prvek ze seznamu selektorů (null = karta uprostřed). */
function findTarget(step) {
    for (const selector of step.targets ?? []) {
        const element = [...document.querySelectorAll(selector)].find(visible);
        if (element) return element;
    }
    return null;
}

/** Počká, až se na stránce objeví první cíl prohlídky (data se ještě můžou načítat). */
async function waitForTargets(steps, timeout = 4000) {
    const first = steps.find((step) => step.targets);
    if (!first) return true;
    const start = performance.now();
    while (performance.now() - start < timeout) {
        if (findTarget(first)) return true;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
}

const reducedMotion = () =>
    document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Spustí prohlídku (overview / collection). Když se stránka mezitím změnila nebo je otevřené okno,
 * nespustí se (a zkusí se příště). Vrací promise, která skončí s prohlídkou.
 */
export async function startTour(name) {
    if (running || !TOURS[name]) return;
    const signedIn = Boolean(getUser());
    const steps = stepsFor(name, signedIn);
    const path = currentPath();
    running = name;
    if (!(await waitForTargets(steps)) || currentPath() !== path || document.querySelector(".modal, dialog[open]")) {
        running = null;
        return;
    }
    await new Promise((resolve) => runTour(name, steps, signedIn, resolve));
    running = null;
}

function runTour(name, steps, signedIn, done) {
    const previousFocus = document.activeElement;
    const hole = h("div", { class: "guide__hole", "aria-hidden": "true" });
    const card = h("div", {
        class: "guide__card", role: "dialog", "aria-modal": "true",
        "aria-labelledby": "guide-title", "aria-describedby": "guide-text",
    });
    const overlay = h("div", { class: "guide" }, hole, card);
    document.body.append(overlay);
    document.body.classList.add("guide-open");

    let index = 0;
    let target = null;
    let frame = 0;

    /** Další krok s cílem na stránce (nebo bez cíle) ve směru dir; -1 = žádný. */
    function nextIndex(from, dir) {
        for (let i = from; i >= 0 && i < steps.length; i += dir) {
            if (!steps[i].targets || findTarget(steps[i])) return i;
        }
        return -1;
    }

    function close() {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", schedule);
        window.removeEventListener("scroll", schedule, true);
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("route-rendered", close);
        overlay.remove();
        document.body.classList.remove("guide-open");
        markSeen(name);
        if (previousFocus instanceof HTMLElement && document.body.contains(previousFocus)) previousFocus.focus();
        done();
    }

    function go(to, dir = 1) {
        const found = nextIndex(to, dir);
        if (found === -1) {
            if (dir > 0) close();
            return;
        }
        index = found;
        show();
    }

    function show() {
        const step = steps[index];
        target = findTarget(step);
        // Pořadí kroku jen mezi kroky, které na stránce opravdu jsou
        const available = steps.filter((s) => !s.targets || findTarget(s));
        const position = available.indexOf(step) + 1;
        const first = nextIndex(index - 1, -1) === -1;
        const text = !signedIn && step.guestText ? step.guestText : step.text;

        const next = h("button", { class: "btn btn--primary btn--small", type: "button", onClick: () => go(index + 1) },
            step.final ? TEXTS.guideDone : TEXTS.guideNext);
        const actions = [
            !step.final ? h("button", { class: "link-button guide__skip", type: "button", onClick: close }, TEXTS.guideSkip) : null,
            h("span", { class: "guide__spacer" }),
            !first ? h("button", { class: "btn btn--small btn--ghost", type: "button", onClick: () => go(index - 1, -1) }, TEXTS.guideBack) : null,
        ];
        // Konec prohlídky přehledu: odkaz na nápovědu (nebo registraci pro nepřihlášeného)
        if (step.final && name === "overview") {
            actions.push(signedIn
                ? h("button", { class: "btn btn--small", type: "button", onClick: () => { close(); navigate("/help"); } }, TEXTS.guideOpenHelp)
                : h("button", { class: "btn btn--small", type: "button", onClick: () => { close(); navigate("/register"); } }, TEXTS.navRegister));
        }
        actions.push(next);

        mount(card,
            h("p", { class: "guide__count" }, `${position} / ${available.length}`),
            h("h2", { class: "guide__title", id: "guide-title" }, TEXTS[step.title]),
            h("p", { class: "guide__text", id: "guide-text" }, TEXTS[text]),
            h("div", { class: "guide__actions" }, actions));

        overlay.classList.toggle("guide--center", !target);
        if (target) target.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
        place();
        // Po plynulém posunu stránky ještě jednou (scroll událost to většinou zařídí sama)
        setTimeout(place, reducedMotion() ? 0 : 450);
        next.focus({ preventScroll: true });
    }

    /** Umístí světlo na cíl a kartičku pod něj / nad něj (na telefonu ke kraji obrazovky). */
    function place() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const cardWidth = Math.min(360, width - 2 * MARGIN);
        card.style.width = `${cardWidth}px`;
        if (!target || !document.body.contains(target)) {
            hole.hidden = true;
            card.style.left = `${(width - cardWidth) / 2}px`;
            card.style.top = `${Math.max(MARGIN, (height - card.offsetHeight) / 2)}px`;
            return;
        }
        const rect = target.getBoundingClientRect();
        hole.hidden = false;
        Object.assign(hole.style, {
            left: `${rect.left - GAP}px`, top: `${rect.top - GAP}px`,
            width: `${rect.width + 2 * GAP}px`, height: `${rect.height + 2 * GAP}px`,
        });
        const cardHeight = card.offsetHeight;
        const below = rect.bottom + GAP + 12;
        const above = rect.top - GAP - 12 - cardHeight;
        let top;
        if (below + cardHeight <= height - MARGIN) top = below;
        else if (above >= MARGIN) top = above;
        else top = rect.top + rect.height / 2 < height / 2 ? height - cardHeight - MARGIN : MARGIN;   // telefon: k opačnému kraji
        const left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - cardWidth / 2), width - cardWidth - MARGIN);
        card.style.left = `${left}px`;
        card.style.top = `${Math.max(MARGIN, top)}px`;
    }

    function schedule() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(place);
    }

    function onKey(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            go(index + 1);
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(index - 1, -1);
        } else if (event.key === "Tab") {
            // Fokus zůstává v kartičce
            const buttons = [...card.querySelectorAll("button")];
            const i = buttons.indexOf(document.activeElement);
            event.preventDefault();
            const nextButton = buttons[(i + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
            nextButton?.focus();
        } else if (event.key === "/") {
            event.stopPropagation();       // „/“ = hledání – během prohlídky ne
        }
    }

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("route-rendered", close);      // odchod na jinou stránku prohlídku ukončí
    go(0);
}
