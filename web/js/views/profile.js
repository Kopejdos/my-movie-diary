// Obrazovka: profil – achievementy a úroveň (záložky Stats, Friends, Lists, Settings).
// Nastavení účtu (nick, heslo, veřejný profil…) je od V4.0 na stránce Settings.

import { isSignedIn, hasGeneratedUsername } from "../auth.js";
import { navigate } from "../router.js";
import { TEXTS } from "../texts.js";
import { setAccent } from "../theme.js";
import { mount } from "../dom.js";
import { achievementsSection } from "./achievements.js";
import { profileTabs } from "./stats.js";

export async function profileView(container) {
    setAccent(null);
    if (!isSignedIn()) {
        navigate("/login");
        return;
    }
    // Uživatel z Googlu si nejdřív vybere nick (v nastavení)
    if (hasGeneratedUsername()) {
        navigate("/settings");
        return;
    }
    document.title = `${TEXTS.profileTitle} · ${TEXTS.appName}`;
    mount(container, profileTabs("profile"), achievementsSection());
}
