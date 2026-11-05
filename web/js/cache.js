// Mezipaměť dat v paměti prohlížeče (V2.1).
// Katalog (kolekce, filmy, kategorie) se mění jen při importu nebo v admin panelu,
// takže ho nemá smysl stahovat při každém přechodu mezi stránkami.
// Ukládá se slib (Promise), ne výsledek – dva souběžné dotazy (např. přednačtení
// a kliknutí) tak sdílí jeden požadavek na server.
// Zhlédnutí, watchlist a postup se NEukládají – ty se načítají vždy čerstvé.

const DEFAULT_TTL_MS = 5 * 60 * 1000;     // 5 minut
const entries = new Map();                 // klíč → { at, promise }

/**
 * Vrátí uložená data, nebo je načte přes loader() a uloží.
 * Chyba se neukládá – příští volání to zkusí znovu.
 */
export function cached(key, loader, ttlMs = DEFAULT_TTL_MS) {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.promise;

    const promise = loader();
    entries.set(key, { at: Date.now(), promise });
    promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
    });
    return promise;
}

/** Zahodí celou mezipaměť (po změně v admin panelu). */
export function clearDataCache() {
    entries.clear();
}
