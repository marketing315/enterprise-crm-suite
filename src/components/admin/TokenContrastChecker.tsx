/**
 * H11+ — Token Contrast Checker
 *
 * Legge in tempo reale i CSS custom properties (HSL) definiti in `:root`
 * e `.dark` (index.css) per le coppie semantiche foreground/background del
 * design system, calcola il contrasto WCAG (rapporto su luminanza relativa)
 * per entrambi i tema e segnala le coppie non conformi per AA / AAA.
 *
 * Tecnica zero-flicker: monta due div nascosti (`light`/`dark`) e usa
 * `getComputedStyle` su quei nodi per leggere i token nel contesto del
 * rispettivo tema senza toccare l'`html.dark` corrente.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sun, Moon } from "lucide-react";

interface TokenPair {
  /** human label */
  label: string;
  /** CSS var name for background, e.g. --background */
  bg: string;
  /** CSS var name for foreground */
  fg: string;
  /** se true il pair è "large text" (≥18pt o ≥14pt bold) → soglia AA 3.0 / AAA 4.5 */
  large?: boolean;
}

const PAIRS: TokenPair[] = [
  { label: "Body — background / foreground", bg: "--background", fg: "--foreground" },
  { label: "Card", bg: "--card", fg: "--card-foreground" },
  { label: "Popover", bg: "--popover", fg: "--popover-foreground" },
  { label: "Primary button", bg: "--primary", fg: "--primary-foreground" },
  { label: "Secondary button", bg: "--secondary", fg: "--secondary-foreground" },
  { label: "Muted", bg: "--muted", fg: "--muted-foreground" },
  { label: "Accent", bg: "--accent", fg: "--accent-foreground" },
  { label: "Destructive", bg: "--destructive", fg: "--destructive-foreground" },
  { label: "Sidebar — background / foreground", bg: "--sidebar-background", fg: "--sidebar-foreground" },
  { label: "Sidebar primary", bg: "--sidebar-primary", fg: "--sidebar-primary-foreground" },
  { label: "Sidebar accent", bg: "--sidebar-accent", fg: "--sidebar-accent-foreground" },
];

// ---------------- HSL → RGB → relative luminance → contrast ----------------

function parseHslVar(raw: string): [number, number, number] | null {
  // Accetta "222.2 47.4% 11.2%" oppure "222 47% 11%" oppure con eventuali spazi extra.
  if (!raw) return null;
  const m = raw.trim().match(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%/);
  if (!m) return null;
  const h = parseFloat(m[1]);
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  return hslToRgb(h, s, l);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const ch = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const L1 = Math.max(la, lb);
  const L2 = Math.min(la, lb);
  return (L1 + 0.05) / (L2 + 0.05);
}

function rgbHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface PairResult {
  pair: TokenPair;
  bgHsl: string;
  fgHsl: string;
  bgHex: string;
  fgHex: string;
  ratio: number;
  aa: boolean;
  aaa: boolean;
}

function evaluate(pair: TokenPair, scope: HTMLElement): PairResult | null {
  const style = getComputedStyle(scope);
  const bgRaw = style.getPropertyValue(pair.bg);
  const fgRaw = style.getPropertyValue(pair.fg);
  const bg = parseHslVar(bgRaw);
  const fg = parseHslVar(fgRaw);
  if (!bg || !fg) return null;
  const ratio = contrastRatio(fg, bg);
  const aaThreshold = pair.large ? 3 : 4.5;
  const aaaThreshold = pair.large ? 4.5 : 7;
  return {
    pair,
    bgHsl: bgRaw.trim(),
    fgHsl: fgRaw.trim(),
    bgHex: rgbHex(bg),
    fgHex: rgbHex(fg),
    ratio,
    aa: ratio >= aaThreshold,
    aaa: ratio >= aaaThreshold,
  };
}

export default function TokenContrastChecker() {
  const lightRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [results, setResults] = useState<{ light: PairResult[]; dark: PairResult[] }>({ light: [], dark: [] });

  useEffect(() => {
    if (!lightRef.current || !darkRef.current) return;
    const light: PairResult[] = [];
    const dark: PairResult[] = [];
    for (const p of PAIRS) {
      const l = evaluate(p, lightRef.current);
      const d = evaluate(p, darkRef.current);
      if (l) light.push(l);
      if (d) dark.push(d);
    }
    setResults({ light, dark });
  }, [tick]);

  // Osserva mutazioni allo stylesheet (ricarica HMR) → re-check automatico.
  useEffect(() => {
    const obs = new MutationObserver(() => setTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => obs.disconnect();
  }, []);

  const stats = useMemo(() => {
    const all = [...results.light, ...results.dark];
    const failingAA = all.filter((r) => !r.aa);
    const failingAAA = all.filter((r) => r.aa && !r.aaa);
    return { total: all.length, failingAA: failingAA.length, failingAAA: failingAAA.length };
  }, [results]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Contrasto token (light + dark)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Verifica in tempo reale dei rapporti di contrasto WCAG sulle coppie semantiche del design system.
            Soglie: AA ≥ 4.5 (testo normale), AAA ≥ 7. Le iterazioni non conformi sono segnalate sotto.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)} aria-label="Ricontrolla">
          <RefreshCw /> Ricontrolla
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{stats.total} coppie</Badge>
          <Badge variant={stats.failingAA ? "destructive" : "outline"}>
            AA non conformi: {stats.failingAA}
          </Badge>
          <Badge variant={stats.failingAAA ? "default" : "outline"}>
            AAA non conformi: {stats.failingAAA}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ResultTable title="Light" icon={<Sun className="h-4 w-4" />} results={results.light} />
          <ResultTable title="Dark" icon={<Moon className="h-4 w-4" />} results={results.dark} />
        </div>

        {/* Sandbox nascoste per leggere i token nei due tema senza toccare il tema attivo */}
        <div aria-hidden="true" className="sr-only">
          <div ref={lightRef} />
          <div ref={darkRef} className="dark" />
        </div>
      </CardContent>
    </Card>
  );
}

function ResultTable({ title, icon, results }: { title: string; icon: React.ReactNode; results: PairResult[] }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <ul className="divide-y text-sm">
        {results.length === 0 && (
          <li className="px-3 py-4 text-xs text-muted-foreground">
            Nessun token leggibile. Verifica che <code>--background</code> e simili siano definiti.
          </li>
        )}
        {results.map((r) => {
          const status: "fail-aa" | "warn-aaa" | "ok" = !r.aa ? "fail-aa" : !r.aaa ? "warn-aaa" : "ok";
          return (
            <li key={`${title}-${r.pair.bg}-${r.pair.fg}`} className="px-3 py-2 flex items-center gap-3">
              <div
                className="h-9 w-14 rounded border flex items-center justify-center text-xs font-medium shrink-0"
                style={{ background: r.bgHex, color: r.fgHex }}
                aria-label={`Anteprima ${r.pair.label}`}
              >
                Aa
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.pair.label}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">
                  {r.pair.bg} {r.bgHex} · {r.pair.fg} {r.fgHex}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm tabular-nums">{r.ratio.toFixed(2)}</div>
                {status === "fail-aa" && <Badge variant="destructive" className="text-[10px]">Fail AA</Badge>}
                {status === "warn-aaa" && <Badge variant="default" className="text-[10px]">Solo AA</Badge>}
                {status === "ok" && <Badge variant="outline" className="text-[10px]">AAA</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
