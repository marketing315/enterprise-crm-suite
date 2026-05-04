#!/usr/bin/env node
/**
 * Strip historical audit-fix codes (B01..B99, H01..H99, R01..R99) from inline
 * code comments. The audit history is preserved in docs/changelog.md.
 *
 * Patterns rewritten (only inside `//` line comments and `/* */` block comments):
 *   `// B07 fix: foo`           → `// foo`
 *   `// B07 FIX: foo`           → `// foo`
 *   `// SECURITY [B01]: foo`    → `// SECURITY: foo`
 *   `// B06: foo`               → `// foo`
 *   `(B01 fix)` / `(R08 fix)`   → removed (and any leading space)
 *   `// B11 - foo`              → `// foo`
 *
 * NEVER touches:
 *   - String literals (e.g. spreadsheet cell refs "B11/30")
 *   - Test descriptions ("B01 - early auth gate")  → kept, they document scenarios
 *
 * Usage:
 *   node scripts/cleanup/strip-audit-codes.mjs           # dry-run, prints diff summary
 *   node scripts/cleanup/strip-audit-codes.mjs --apply   # writes changes
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");

const ROOTS = ["src", "supabase/functions"];
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const AUDIT = "[BHR]\\d{1,3}"; // B01, H05, R08, etc.

// Patterns operate ONLY on comment lines (// ...) or inline (/* ... */).
// We rewrite by line; lines fully inside a string template are not perfectly
// detected — acceptable trade-off, we explicitly exclude .test files which
// use these codes intentionally in test descriptions.
const SKIP_FILE_PATTERNS = [/\.test\.(ts|tsx|js|mjs)$/, /\.spec\.(ts|tsx|js|mjs)$/];

const RULES = [
  // // SECURITY [B01]: msg  →  // SECURITY: msg
  { re: new RegExp(`(\\/\\/\\s*SECURITY)\\s*\\[${AUDIT}\\]\\s*:`, "g"), to: "$1:" },
  // // B07 fix: msg  /  // B07 FIX: msg  /  // B07 Fix: msg  →  // msg
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s+[Ff][Ii][Xx]\\s*:\\s*`, "g"), to: "$1" },
  // // B06: msg  →  // msg
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s*:\\s*`, "g"), to: "$1" },
  // // B07 fix - msg  →  // msg
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s+[Ff][Ii][Xx]\\s*[-–]\\s*`, "g"), to: "$1" },
  // // B11 - msg  →  // msg  (rare bare form)
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s*[-–]\\s*`, "g"), to: "$1" },
  // (B01 fix) / (R08 fix) inline annotations → drop, including any leading space
  { re: new RegExp(`\\s*\\(${AUDIT}\\s+[Ff][Ii][Xx]\\)`, "g"), to: "" },
];

function listFiles() {
  const out = [];
  for (const root of ROOTS) {
    const cmd = `find ${root} -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \\)`;
    const files = execSync(cmd, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    for (const f of files) {
      if (SKIP_FILE_PATTERNS.some((p) => p.test(f))) continue;
      out.push(f);
    }
  }
  return out;
}

function processFile(path) {
  const original = readFileSync(path, "utf8");
  let text = original;
  const matches = [];

  for (const { re, to } of RULES) {
    text = text.replace(re, (m, ...args) => {
      // Reconstruct what would be written for logging
      matches.push({ match: m.replace(/\n/g, "\\n").trim() });
      return m.replace(re, to);
    });
  }

  if (text === original) return null;
  return { path, original, text, count: matches.length, matches };
}

const files = listFiles();
const changed = [];
for (const f of files) {
  const res = processFile(f);
  if (res) changed.push(res);
}

let totalReplacements = 0;
for (const c of changed) totalReplacements += c.count;

console.log(`Scanned ${files.length} files.`);
console.log(`Files needing changes: ${changed.length}`);
console.log(`Total replacements: ${totalReplacements}`);
console.log("");
console.log("Per-file summary:");
for (const c of changed) {
  console.log(`  ${c.path}: ${c.count}`);
}

if (APPLY) {
  for (const c of changed) writeFileSync(c.path, c.text, "utf8");
  console.log("\n✅ Applied.");
} else {
  console.log("\n(dry-run) Re-run with --apply to write changes.");
}
