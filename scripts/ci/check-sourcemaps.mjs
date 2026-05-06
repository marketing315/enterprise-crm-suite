#!/usr/bin/env node
/**
 * H10 — Source maps in produzione
 *
 * Verifica che la build di produzione NON contenga file `.map` né reference
 * `//# sourceMappingURL=` nei bundle JS/CSS serviti pubblicamente.
 *
 * Le source map in prod espongono codice originale, nomi simbolici e path
 * interni: devono essere `false` in `vite.config.ts` (vedi `build.sourcemap`)
 * oppure caricate solo su un endpoint privato (Sentry-style), mai servite
 * insieme agli asset pubblici.
 *
 * Exit 0 se ok, exit 1 se trova violazioni. Se `dist/` non esiste, il check
 * è no-op (ambienti senza build, es. CI lint-only).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const violations = [];

if (!existsSync(DIST)) {
  console.log("ℹ️  H10 sourcemap guard: dist/ non presente, skip");
  process.exit(0);
}

// 1. vite.config.ts: sourcemap deve essere false (o assente) per prod
const viteCfg = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
const smMatch = viteCfg.match(/sourcemap\s*:\s*(true|"inline"|"hidden")/);
if (smMatch) {
  violations.push(
    `[vite.config.ts] build.sourcemap = ${smMatch[1]} — disabilitare in produzione (sourcemap: false)`
  );
}

// 2. Walk dist/ for .map files and sourceMappingURL refs
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

for (const file of walk(DIST)) {
  if (extname(file) === ".map") {
    violations.push(`[dist] sourcemap file presente: ${file.replace(ROOT + "/", "")}`);
    continue;
  }
  if ([".js", ".css", ".mjs"].includes(extname(file))) {
    const content = readFileSync(file, "utf8");
    // Accetta sourceMappingURL solo come data URL inline NON presente, o assente.
    // In prod hardened: nessun riferimento esterno a .map.
    const m = content.match(/[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/);
    if (m && !m[1].startsWith("data:")) {
      violations.push(
        `[dist] reference sourceMappingURL=${m[1]} in ${file.replace(ROOT + "/", "")}`
      );
    }
  }
}

if (violations.length > 0) {
  console.error("\n❌ H10 sourcemap guard FAILED:\n");
  for (const v of violations) console.error("  • " + v);
  console.error("\nFix: vedi vite.config.ts (build.sourcemap: false) e mem://features/h10-sourcemaps-prod.\n");
  process.exit(1);
}

console.log("✅ H10 sourcemap guard OK (no .map files, no sourceMappingURL refs in dist/)");
