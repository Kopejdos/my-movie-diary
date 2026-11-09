// Společné pomůcky pro práci s databází a Edge Functions (V3.6.2 – dřív byly
// zkopírované v několika modulech). Čistá logika, nic nevykresluje.

import { supabase } from "./supabase.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

/** Výsledek dotazu Supabase → data, nebo výjimka s textem chyby. */
export function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Načte všechny řádky po stránkách – Supabase vrací nejvýš 1000 řádků na dotaz.
 * buildQuery musí řadit podle jednoznačného sloupce, jinak by se stránky překrývaly.
 */
export async function fetchAllRows(buildQuery, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const page = await buildQuery().range(from, from + pageSize - 1).then(check);
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}

/** Chyba z Edge Function: text, kód (limit, not_same_series…) a HTTP stav. */
export class FunctionError extends Error {
    constructor(message, code = "error", status = 0) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

/**
 * Zavolá akci Edge Function s přístupovým tokenem přihlášeného uživatele
 * (funkce admin, requests). Odpověď JSON, při chybě FunctionError.
 */
export async function callFunction(name, action, payload = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new FunctionError("Not signed in", "not_signed_in", 401);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ...payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new FunctionError(body.error ?? `HTTP ${response.status}`, body.code ?? "error", response.status);
    return body;
}
