#!/usr/bin/env bash
# SBOM generation script
# Produce una distinta delle dipendenze npm con vulnerabilità note.
# Output: ./sbom.json (CycloneDX-like minimal) + popola dependency_inventory via SQL.
#
# Uso:
#   ./scripts/generate-sbom.sh           # genera solo file json
#   ./scripts/generate-sbom.sh --upload  # carica anche in DB (richiede PG* env)

set -euo pipefail

OUT="${OUT:-./sbom.json}"
UPLOAD=false
[[ "${1:-}" == "--upload" ]] && UPLOAD=true

echo "→ Generating SBOM via npm list..."
npm list --all --json > /tmp/npm-tree.json 2>/dev/null || true

echo "→ Running npm audit (JSON)..."
npm audit --json > /tmp/npm-audit.json 2>/dev/null || true

node <<'JS' > "$OUT"
const fs = require('fs');
const tree = JSON.parse(fs.readFileSync('/tmp/npm-tree.json', 'utf8'));
const audit = JSON.parse(fs.readFileSync('/tmp/npm-audit.json', 'utf8'));
const pkg  = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

const devDeps = new Set(Object.keys(pkg.devDependencies || {}));
const components = [];

function walk(deps) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) {
    components.push({
      name,
      version: info.version || 'unknown',
      isDev: devDeps.has(name),
    });
    if (info.dependencies) walk(info.dependencies);
  }
}
walk(tree.dependencies);

const vulns = audit.vulnerabilities || {};
const enriched = components.map((c) => {
  const v = vulns[c.name];
  return {
    ...c,
    hasVulnerability: !!v,
    severity: v ? v.severity : null,
    via: v ? (Array.isArray(v.via) ? v.via.map((x) => typeof x === 'string' ? x : x.title) : []) : [],
  };
});

console.log(JSON.stringify({
  generated_at: new Date().toISOString(),
  total_packages: enriched.length,
  vulnerable_count: enriched.filter(e => e.hasVulnerability).length,
  components: enriched,
}, null, 2));
JS

echo "✓ SBOM written to $OUT"

if $UPLOAD; then
  if [[ -z "${PGHOST:-}" ]]; then
    echo "✗ PGHOST non configurato, salto upload"
    exit 0
  fi
  echo "→ Uploading to dependency_inventory..."
  node <<JS | psql -v ON_ERROR_STOP=1 -f -
const fs = require('fs');
const sbom = JSON.parse(fs.readFileSync('$OUT', 'utf8'));
const seen = new Set();
console.log("BEGIN;");
console.log("DELETE FROM public.dependency_inventory;");
for (const c of sbom.components) {
  if (seen.has(c.name)) continue;
  seen.add(c.name);
  const sev = c.severity ? \`'\${c.severity}'\` : 'NULL';
  const name = c.name.replace(/'/g, "''");
  const ver = (c.version || '').replace(/'/g, "''");
  console.log(\`INSERT INTO public.dependency_inventory (package_name, current_version, is_dev_dependency, has_vulnerability, vulnerability_severity, last_scanned_at) VALUES ('\${name}', '\${ver}', \${c.isDev}, \${c.hasVulnerability}, \${sev}, now()) ON CONFLICT (package_name) DO UPDATE SET current_version=EXCLUDED.current_version, has_vulnerability=EXCLUDED.has_vulnerability, vulnerability_severity=EXCLUDED.vulnerability_severity, last_scanned_at=now();\`);
}
console.log("COMMIT;");
JS
  echo "✓ Uploaded"
fi
