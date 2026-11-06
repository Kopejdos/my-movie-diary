// Náhrady částí supabase-js, které My Movie Diary nepoužívá (V2.7).
// Realtime (živé změny přes WebSocket), Storage (soubory) ani Functions klient web
// nepotřebuje – Edge Functions volá přes obyčejný fetch. Knihovna ale tyhle třídy
// při startu vytváří, proto tu jsou prázdné náhrady se stejnými názvy.

const NOT_INCLUDED = "This part of supabase-js is not included in the My Movie Diary build.";

export class RealtimeClient {
    setAuth() { return Promise.resolve(); }
    channel() { throw new Error(NOT_INCLUDED); }
    getChannels() { return []; }
    removeChannel() { return Promise.resolve("ok"); }
    removeAllChannels() { return Promise.resolve([]); }
}

export class StorageClient {
    from() { throw new Error(NOT_INCLUDED); }
}
export class StorageApiError extends Error {}

export class FunctionsClient {
    invoke() { throw new Error(NOT_INCLUDED); }
}
export const FunctionRegion = {};
export class FunctionsError extends Error {}
export class FunctionsFetchError extends FunctionsError {}
export class FunctionsHttpError extends FunctionsError {}
export class FunctionsRelayError extends FunctionsError {}
