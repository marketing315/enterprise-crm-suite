#!/usr/bin/env node
/**
 * H9 — i18next & SRI guard
 *
 * Fail-fast CI script. Verifica che:
 *  1. index.html non carichi <script src="https://..."> o <link rel="stylesheet" href="https://..."> cross-origin senza `integrity=`.
 *  2. Nessun file in src/ introduca `i18next-http-backend` con `loadPath` non https o senza SRI doc.
 *  3. Tutti i `loadPath` i18next eventualmente presenti siano https://.
 *
 * Exit 0 se tutto ok, exit 1 se trova violazioni.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const violations = [];

// ── 1. index.html cross-origin SRI check ────────────────────────────────
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const tagRegex = /<(script|link)\b[^>]*>/gi;
for (const match of html.matchAll(tagRegex)) {
  const tag = match[0];
  const isScript = match[1].toLowerCase() === "script";
  const isStylesheet = !isScript && /rel\s*=\s*["']?stylesheet/i.test(tag);
  if (!isScript && !isStylesheet) continue;
  const srcMatch = tag.match(/(?:src|href)\s*=\s*["']([^"']+)["']/i);
  if (!srcMatch) continue;
  const url = srcMatch[1];
  // Solo URL assoluti https/http esterni → richiedono integrity
  if (!/^https?:\/\//i.test(url)) continue;
  if (/^https:\/\/fonts\.googleapis\.com/i.test(url)) continue; // Google Fonts API: no SRI possibile (dynamic)
  const hasIntegrity = /\bintegrity\s*=\s*["'][^"']+["']/i.test(tag);
  if (!hasIntegrity) {
    violations.push(
      `[index.html] cross-origin ${match[1]} senza integrity=: ${url}`
    );
  }
}

// ── 2. Walk src/ for i18next-http-backend / loadPath ────────────────────
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(p))) yield p;
  }
}

for (const file of walk(join(ROOT, "src"))) {
  const content = readFileSync(file, "utf8");
  if (/from\s+["']i18next-http-backend["']/.test(content)) {
    // Se introdotto, deve avere commento esplicito di review SRI
    if (!/H9-SRI-REVIEWED/.test(content)) {
      violations.push(
        `[${file}] importa i18next-http-backend senza marker H9-SRI-REVIEWED. ` +
        `Aggiungere SRI hashes per i bundle locale e commento // H9-SRI-REVIEWED dopo review.`
      );
    }
  }
  // loadPath HTTP non sicuro
  const loadPathMatch = content.match(/loadPath\s*:\s*["']([^"']+)["']/);
  if (loadPathMatch) {
    const url = loadPathMatch[1];
    if (/^http:\/\//i.test(url)) {
      violations.push(`[${file}] loadPath usa http://: ${url} — usare https://`);
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.error("\n❌ H9 SRI/i18n guard FAILED:\n");
  for (const v of violations) console.error("  • " + v);
  console.error(
    "\nSee mem://features/h9-sri-i18n-guard for remediation guidance.\n"
  );
  process.exit(1);
}

console.log("✅ H9 SRI/i18n guard OK (no cross-origin assets without integrity, no insecure i18n loadPath)");
