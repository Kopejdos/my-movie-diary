// Deník správců (V4.4.6) – čistá logika bez vykreslování: popisky akcí a shrnutí podrobností.
// Obrazovka je ve views/admin-activity.js, zápis záznamů v admin.js (logAdmin) a v Edge Function admin.

import { TEXTS } from "./texts.js";

/** Popisek akce (kódy z Edge Function admin a z admin.js). Neznámý kód se ukáže tak, jak je. */
export function actionLabel(action) {
    return TEXTS[`adminLog_${String(action).replace(/-/g, "_")}`] ?? action;
}

/** Krátké shrnutí podrobností záznamu do jednoho řádku. */
export function detailsSummary(details) {
    if (!details || typeof details !== "object") return "";
    const parts = [];
    for (const [key, value] of Object.entries(details)) {
        if (value === null || value === undefined || value === false) continue;
        if (Array.isArray(value)) {
            if (value.length === 0) continue;
            parts.push(`${key}: ${value.slice(0, 5).join(", ")}${value.length > 5 ? ` +${value.length - 5}` : ""}`);
        } else if (value === true) {
            parts.push(key);
        } else if (typeof value === "object") {
            parts.push(`${key}: ${JSON.stringify(value)}`);
        } else {
            parts.push(`${key}: ${value}`);
        }
    }
    return parts.join(" · ");
}
