// Háček pro načítání modulů (node:module register): import „./supabase.js“
// z web/js přesměruje na tests/stub-supabase.mjs.
const STUB = new URL("./stub-supabase.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
    if (specifier.endsWith("/supabase.js") && context.parentURL?.includes("/web/js/")) {
        return { url: STUB, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
