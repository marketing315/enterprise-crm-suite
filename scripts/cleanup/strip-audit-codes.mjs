#!/usr/bin/env node
/**
 * Strip historical audit-fix codes (B01..B99, H01..H99, R01..R99) from inline
 * code comments. The audit history is preserved in docs/changelog.md.
 *
 * Patterns rewritten (only inside line/block comments):
 *   "// B07 fix: foo"           -> "// foo"
 *   "// B07 FIX: foo"           -> "// foo"
 *   "// SECURITY [B01]: foo"    -> "// SECURITY: foo"
 *   "// B06: foo"               -> "// foo"
 *   "(B01 fix)" / "(R08 fix)"   -> removed (and any leading space)
 *
 * NEVER touches:
 *   - String literals (e.g. spreadsheet cell refs "B11/30")
 *   - Test descriptions ("B01 - early auth gate")  -> kept
 *
 * Usage:
 *   node scripts/cleanup/strip-audit-codes.mjs           # dry-run
 *   node scripts/cleanup/strip-audit-codes.mjs --apply   # writes changes
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");

const ROOTS = ["src", "supabase/functions"];
const AUDIT = "[BHR]\\d{1,3}";

const SKIP_FILE_PATTERNS = [/\.test\.(ts|tsx|js|mjs)$/, /\.spec\.(ts|tsx|js|mjs)$/];

const RULES = [
  // // SECURITY [B01]: msg  ->  // SECURITY: msg
  { re: new RegExp(`(\\/\\/\\s*SECURITY)\\s*\\[${AUDIT}\\]\\s*:`, "g"), to: "$1:" },
  // // B07 fix: / FIX: / Fix:   ->  // (clean)
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s+[Ff][Ii][Xx]\\s*:\\s*`, "g"), to: "$1" },
  // // B07 fix - msg  ->  // msg
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s+[Ff][Ii][Xx]\\s*[-]\\s*`, "g"), to: "$1" },
  // // B06: msg  ->  // msg
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s*:\\s*`, "g"), to: "$1" },
  // // B11 - msg  ->  // msg
  { re: new RegExp(`(\\/\\/\\s*)${AUDIT}\\s*[-]\\s*`, "g"), to: "$1" },
  // (B01 fix) inline -> drop with leading whitespace
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
  let count = 0;

  for (const { re, to } of RULES) {
    text = text.replace(re, (m) => {
      count++;
      return m.replace(re, to);
    });
  }

  if (text === original) return null;
  return { path, text, count };
}

const files = listFiles();
const changed = [];
for (const f of files) {
  const res = processFile(f);
  if (res) changed.push(res);
}

const totalReplacements = changed.reduce((s, c) => s + c.count, 0);

console.log(`Scanned ${files.length} files.`);
console.log(`Files needing changes: ${changed.length}`);
console.log(`Total replacements: ${totalReplacements}`);
console.log("\nPer-file summary:");
for (const c of changed) console.log(`  ${c.path}: ${c.count}`);

if (APPLY) {
  for (const c of changed) writeFileSync(c.path, c.text, "utf8");
  console.log("\nApplied.");
} else {
  console.log("\n(dry-run) Re-run with --apply to write changes.");
}
