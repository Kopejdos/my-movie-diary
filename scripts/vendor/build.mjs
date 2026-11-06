// Sestavení knihovny Supabase pro web (V2.7) – jen přihlášení (auth-js) a dotazy
// do databáze (postgrest-js). Realtime, Storage a Functions se nahradí prázdnými
// třídami ze stubs.js → soubor je zhruba o polovinu menší.
//
// Použití (jednou za čas, při aktualizaci knihovny – viz docs/setup.md, kap. 9):
//   mkdir /tmp/sb && cd /tmp/sb && npm init -y && npm install @supabase/supabase-js esbuild
//   node <cesta k repozitáři>/scripts/vendor/build.mjs
// Výsledek: web/vendor/supabase-lite-<verze>.min.js

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// esbuild a knihovna se hledají ve složce, kde se skript spouští (npm install tam)
const require = createRequire(join(process.cwd(), "package.json"));
const { build } = require("esbuild");
const version = JSON.parse(readFileSync(require.resolve("@supabase/supabase-js/package.json"), "utf8")).version;
const outfile = join(here, "..", "..", "web", "vendor", `supabase-lite-${version}.min.js`);

const stubbed = /^@supabase\/(realtime-js|storage-js|functions-js)$/;

await build({
    stdin: {
        contents: 'export { createClient } from "@supabase/supabase-js";',
        resolveDir: process.cwd(),
        loader: "js",
    },
    bundle: true,
    format: "esm",
    minify: true,
    target: "es2020",
    legalComments: "none",
    outfile,
    plugins: [{
        name: "mmd-stubs",
        setup(builder) {
            builder.onResolve({ filter: stubbed }, () => ({ path: join(here, "stubs.js") }));
        },
    }],
});

console.log(`OK → ${outfile}`);
