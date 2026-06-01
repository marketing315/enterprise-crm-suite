import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Database,
  FileSpreadsheet,
  Gauge,
  Headphones,
  LineChart,
  Mic,
  PhoneCall,
  Radio,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";

type Status = "live" | "beta" | "wip";

interface ModuleEntry {
  title: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  status: Status;
  highlight?: string;
  roles?: string[];
}

interface Section {
  id: string;
  phase: string;
  title: string;
  subtitle: string;
  accent: string; // tailwind gradient
  entries: ModuleEntry[];
}

const SECTIONS: Section[] = [
  {
    id: "f0",
    phase: "F0",
    title: "Fondamenta — Sorgenti & Attribuzione",
    subtitle:
      "Anagrafica numeri tracciati e regole di attribuzione condivise: la spina dorsale di tutta la dashboard.",
    accent: "from-slate-500/15 via-slate-500/5 to-transparent",
    entries: [
      {
        title: "Registry numeri tracciati",
        description:
          "Numeri verdi TV, cellulari e DID VoiSpeed con emittente, canale e operatore di default.",
        path: "/admin/tracking-numbers",
        icon: Radio,
        status: "live",
        highlight: "Source-of-truth attribuzione",
      },
    ],
  },
  {
    id: "f1",
    phase: "F1 · Modulo A",
    title: "Canali, Costi & Attribuzione",
    subtitle:
      "Spesa per canale, CPL/CAC, confronto A/B tra fonti e import costi multi-formato.",
    accent: "from-blue-500/15 via-blue-500/5 to-transparent",
    entries: [
      {
        title: "Marketing Performance",
        description:
          "KPI roll-up, tabella canale/emittente/campagna, tree-picker fonte, A/B compare e per-fonte vendite.",
        path: "/marketing/performance",
        icon: BarChart3,
        status: "live",
        highlight: "CPL · CAC · ROAS",
      },
      {
        title: "Costi & import CSV",
        description:
          "Inserimento costi TV manuali per emittente, import CSV con mapping colonne e cost_kind.",
        path: "/marketing/costi",
        icon: Database,
        status: "live",
      },
    ],
  },
  {
    id: "f2",
    phase: "F2 · Modulo B",
    title: "Call Center & VoiSpeed",
    subtitle:
      "Wallboard live operatori, performance per numero verde, KPI inbound/outbound.",
    accent: "from-emerald-500/15 via-emerald-500/5 to-transparent",
    entries: [
      {
        title: "Wallboard Call Center",
        description:
          "KPI globali, answer-rate, AHT, breakdown per canale inbound con refresh configurabile e filtri data.",
        path: "/callcenter/wallboard",
        icon: Activity,
        status: "live",
        highlight: "Real-ish time",
      },
      {
        title: "Performance Operatori",
        description:
          "Storico chiamate, ranking operatori, esiti e durata media.",
        path: "/admin/callcenter-kpi",
        icon: Headphones,
        status: "live",
      },
    ],
  },
  {
    id: "f3",
    phase: "F3 · Modulo B+",
    title: "Trascrizione & Sentiment",
    subtitle:
      "Whisper STT + Gemini per analisi semantica, diarizzazione cliente/operatore e ricerca full-text.",
    accent: "from-violet-500/15 via-violet-500/5 to-transparent",
    entries: [
      {
        title: "Trascrizioni Call Center",
        description:
          "Esplora trascrizioni con filtri per sentiment, esito, intent, decisione, obiezioni e keyword.",
        path: "/callcenter/transcripts",
        icon: Mic,
        status: "live",
        highlight: "Whisper + Gemini",
      },
    ],
  },
  {
    id: "f4",
    phase: "F4 · Modulo C",
    title: "Foglio ESITO APPUNTAMENTI",
    subtitle:
      "KPI venditori 1:1 con il foglio aziendale: % esecuzione, % vendita, lordo, imponibile, % consegne, bonus tier.",
    accent: "from-amber-500/15 via-amber-500/5 to-transparent",
    entries: [
      {
        title: "Sales Performance Sheet",
        description:
          "Tabella venditori con footer aggregato brand, drill-down per venditore, export CSV e gestione bonus tier.",
        path: "/sales/performance-sheet",
        icon: FileSpreadsheet,
        status: "live",
        highlight: "Lifecycle multi-attore",
      },
      {
        title: "Vendite & Lifecycle ordini",
        description:
          "Stati ordine (firmato/lavorabile/consegnato/respinto/sospeso/recesso) con eventi append-only.",
        path: "/sales",
        icon: TrendingUp,
        status: "live",
      },
    ],
  },
  {
    id: "f5",
    phase: "F5 · Rifiniture",
    title: "Alert, Export, Compliance",
    subtitle:
      "Materialized views rinfrescate ogni 15 min, regole soglie, export Google Sheets e DPIA/retention.",
    accent: "from-rose-500/15 via-rose-500/5 to-transparent",
    entries: [
      {
        title: "Alert performance",
        description:
          "Regole CPL/answer-rate/% consegne/sentiment con cooldown anti-spam e mirror su notifiche.",
        path: "/admin/performance-alerts",
        icon: Bell,
        status: "live",
      },
      {
        title: "Retention & DPIA",
        description:
          "Configurazione retention per brand (audio/trascrizioni/alert/export) con dry-run e cleanup notturno.",
        path: "/admin/data-retention",
        icon: Shield,
        status: "live",
        highlight: "GDPR-ready",
      },
      {
        title: "Stato del servizio",
        description:
          "SLO, burn-rate, salute generale del sistema e materializzazioni performance.",
        path: "/admin/slo-board",
        icon: Gauge,
        status: "live",
      },
    ],
  },
];

const STATUS_STYLES: Record<Status, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  beta: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  wip: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<Status, string> = {
  live: "Live",
  beta: "Beta",
  wip: "In corso",
};

function ModuleCard({ entry }: { entry: ModuleEntry }) {
  const Icon = entry.icon;
  return (
    <Link
      to={entry.path}
      className="group relative block overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-[0_8px_30px_-12px_hsl(var(--foreground)/0.15)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/5 text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="mt-4 space-y-1.5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {entry.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {entry.description}
        </p>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Badge
          variant="outline"
          className={`h-5 px-2 text-[10px] font-medium uppercase tracking-wider ${STATUS_STYLES[entry.status]}`}
        >
          {STATUS_LABEL[entry.status]}
        </Badge>
        {entry.highlight ? (
          <span className="text-[11px] font-medium text-muted-foreground">
            · {entry.highlight}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function SectionBlock({ section, index }: { section: Section; index: number }) {
  return (
    <section
      className="relative animate-fade-in"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "backwards" }}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 -top-8 -z-10 h-48 bg-gradient-to-b ${section.accent} blur-2xl`}
      />
      <div className="mb-6 flex items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span className="inline-block h-1 w-1 rounded-full bg-foreground/40" />
            {section.phase}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {section.title}
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {section.subtitle}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {section.entries.map((entry) => (
          <ModuleCard key={entry.path} entry={entry} />
        ))}
      </div>
    </section>
  );
}

import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePerformanceHub } from "@/components/performance/mobile/MobilePerformanceHub";

export default function PerformanceHub() {
  const isMobileViewport = useIsMobile();
  if (isMobileViewport) return <MobilePerformanceHub />;
  return <PerformanceHubDesktop />;
}

function PerformanceHubDesktop() {
  const { user } = useAuth();
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Buona notte";
    if (h < 13) return "Buongiorno";
    if (h < 19) return "Buon pomeriggio";
    return "Buona sera";
  }, []);

  const totalModules = SECTIONS.reduce((acc, s) => acc + s.entries.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
        {/* Hero */}
        <header className="mb-16 animate-fade-in">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Dashboard Performance · suite completa
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {greeting}
            {user?.email ? "." : "."}
            <br />
            <span className="bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text text-transparent">
              Tutto il funnel, in un solo posto.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Canali e costi, call center con sentiment, venditori con il Foglio
            ESITO APPUNTAMENTI, alert, export Sheets e compliance GDPR — sei
            fasi rilasciate, {totalModules} moduli a portata di click.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-4">
            {[
              { label: "Fasi rilasciate", value: "6", icon: Waves },
              { label: "Moduli attivi", value: String(totalModules), icon: Target },
              { label: "Refresh KPI", value: "15 min", icon: LineChart },
              { label: "Coverage funnel", value: "Lead → Consegna", icon: PhoneCall },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="flex flex-col gap-2 bg-card/80 p-5 backdrop-blur-xl"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="text-2xl font-semibold tracking-tight text-foreground">
                    {stat.value}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </header>

        {/* Sections */}
        <div className="space-y-20">
          {SECTIONS.map((section, idx) => (
            <SectionBlock key={section.id} section={section} index={idx} />
          ))}
        </div>

        <Separator className="my-20 opacity-50" />

        {/* Footer note */}
        <Card className="border-border/60 bg-card/40 backdrop-blur-xl">
          <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Una sola dimensione &laquo;Fonte&raquo;
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ogni lead, chiamata, appuntamento e ordine è riconducibile
                  alla stessa gerarchia categoria → canale → campagna/emittente.
                </p>
              </div>
            </div>
            <Link
              to="/admin/changelog"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              Changelog &amp; runbook →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
