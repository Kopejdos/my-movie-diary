// Právní stránky (terms.html, privacy.html – V4.2.2): zůstávají anglicky (závazná je jedna verze),
// ale kdo má aplikaci v jiném jazyce, uvidí pod nadpisem krátkou poznámku ve svém jazyce
// s odkazem na stránku About, kde jsou pravidla a ochrana dat shrnuté přeloženě.
// Obyčejný skript (ne modul) – stránky nenačítají zbytek aplikace.
(function () {
    const NOTES = {
        cs: ["Tato stránka je jen v angličtině – platí anglické znění.", "To hlavní česky najdeš na stránce O aplikaci →"],
        de: ["Diese Seite gibt es nur auf Englisch – maßgeblich ist die englische Fassung.", "Das Wichtigste auf Deutsch steht auf der Seite Über die App →"],
        es: ["Esta página solo está en inglés; la versión inglesa es la vinculante.", "Lo esencial en español está en la página Acerca de →"],
        uk: ["Ця сторінка лише англійською — чинною є англійська версія.", "Головне українською — на сторінці «Про застосунок» →"],
    };

    /** Stejná volba jazyka jako v js/texts.js: nastavení, jinak prohlížeč (slovenština → čeština). */
    function pickLanguage() {
        let chosen = "auto";
        try {
            chosen = JSON.parse(localStorage.getItem("mmd-settings") || "{}").language || "auto";
        } catch { }
        if (chosen === "en" || chosen in NOTES) return chosen;
        const wanted = (navigator.languages || [navigator.language || "en"])
            .map((code) => String(code).toLowerCase().split("-")[0])
            .map((code) => (code === "sk" ? "cs" : code));
        return wanted.find((code) => code === "en" || code in NOTES) || "en";
    }

    const lang = pickLanguage();
    const heading = document.querySelector(".legal h1");
    if (!NOTES[lang] || !heading) return;

    const note = document.createElement("p");
    note.className = "legal__note";
    note.lang = lang;
    note.append(NOTES[lang][0], " ");
    const link = document.createElement("a");
    link.href = "./#/about";
    link.textContent = NOTES[lang][1];
    note.append(link);
    heading.after(note);
})();
