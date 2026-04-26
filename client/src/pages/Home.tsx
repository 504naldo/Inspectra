import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Shield, Loader2, AlertTriangle, CheckCircle, Clock, MapPin,
  Wrench, FileText, Building2, ChevronRight, Activity,
  ClipboardCheck, BarChart3, Wifi, ArrowRight, Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Tiny hero mockup ────────────────────────────────────────────────────────

function DashboardMockup() {
  const jobs = [
    { site: "Parkview Medical", type: "Fire Alarm", status: "In Progress", cls: "bg-blue-500/20 text-blue-300" },
    { site: "Westfield Plaza",  type: "Sprinkler ITM", status: "Scheduled",   cls: "bg-slate-500/20 text-slate-300" },
    { site: "Harbor Towers",    type: "Fire Alarm",    status: "Report Ready", cls: "bg-emerald-500/20 text-emerald-300" },
    { site: "City Hall Annex",  type: "Work Order",    status: "Priority",     cls: "bg-red-500/20 text-red-300" },
  ];

  return (
    <div className="bg-[#0a1929] rounded-2xl border border-white/10 p-5 shadow-2xl w-full max-w-md mx-auto lg:mx-0">
      {/* chrome bar */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-[11px] font-medium text-white/60 tracking-wide uppercase">Inspectra</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <div className="w-2 h-2 rounded-full bg-green-500/60" />
        </div>
      </div>

      {/* stat chips */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Scheduled Jobs",     value: "18",   color: "text-blue-400" },
          { label: "Open Deficiencies",  value: "7",    color: "text-orange-400" },
          { label: "Sites Protected",    value: "142",  color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white/5 rounded-lg p-2.5 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-white/40 mt-0.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* job rows */}
      <div className="space-y-1.5 mb-3">
        {jobs.map((j) => (
          <div key={j.site} className="flex items-center justify-between bg-white/5 rounded-md px-3 py-2">
            <div>
              <div className="text-[11px] font-medium text-white/80">{j.site}</div>
              <div className="text-[10px] text-white/40">{j.type}</div>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${j.cls}`}>{j.status}</span>
          </div>
        ))}
      </div>

      {/* bottom row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Devices",  value: "4,891",  color: "text-white/70" },
          { label: "Reports",  value: "23",     color: "text-white/70" },
          { label: "Sync",     value: "Live",   color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white/5 rounded-md p-2 text-center">
            <div className={`text-xs font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-white/30">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  // Authenticated users see a spinner while App.tsx's effect redirects them
  if (loading || (isAuthenticated && user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1f2d]">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  const scrollToWorkflow = () =>
    document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-[#0d1f2d] text-white">

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-[#0d1f2d]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-red-400" />
            <span className="font-bold text-white tracking-tight">Inspectra</span>
          </div>
          <a href={getLoginUrl()}>
            <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white font-semibold px-5">
              Sign In
            </Button>
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-red-600/15 border border-red-500/25 px-3.5 py-1.5 text-xs font-medium text-red-300">
            <Flame className="h-3.5 w-3.5" />
            Fire Protection Operations Platform
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">
            Keep fire protection work moving from dispatch to{" "}
            <span className="text-red-400">final report.</span>
          </h1>
          <p className="text-white/55 text-lg leading-relaxed">
            Inspectra gives office teams and technicians one connected place to schedule work,
            manage sites, complete inspections, track deficiencies, and generate reports.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={getLoginUrl()}>
              <Button size="lg" className="bg-red-600 hover:bg-red-500 text-white font-semibold px-7 gap-2">
                Open Inspectra <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <Button
              size="lg"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 font-semibold px-7"
              onClick={scrollToWorkflow}
            >
              See the Workflow
            </Button>
          </div>
        </div>
        <DashboardMockup />
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────────── */}
      <section id="workflow" className="border-y border-white/10 bg-white/[0.03] py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-center text-2xl font-bold mb-12">End-to-end in one system</h2>
          <div className="flex flex-wrap justify-center items-center gap-2">
            {[
              { label: "Site Record",       icon: Building2 },
              { label: "Schedule",          icon: Clock },
              { label: "Work Order",        icon: Wrench },
              { label: "Inspect",           icon: ClipboardCheck },
              { label: "Deficiency Review", icon: AlertTriangle },
              { label: "Report",            icon: FileText },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                    <step.icon className="h-5 w-5 text-white/70" />
                  </div>
                  <span className="text-xs text-white/50 font-medium whitespace-nowrap">{step.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-white/20 mt-[-18px] shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Office + Technician ───────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold mb-10 text-center">Built for everyone on your team</h2>
        <div className="grid md:grid-cols-2 gap-6">

          {/* Office card */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-7 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <div className="font-semibold text-white">Office &amp; Dispatch</div>
                <div className="text-xs text-white/40">Coordinate all field operations</div>
              </div>
            </div>
            <ul className="space-y-2.5">
              {[
                "Monthly service tracking and scheduling",
                "Work orders and priority flags",
                "Customer and site records",
                "Deficiency follow-up and status tracking",
                "Report generation and delivery",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-white/65">
                  <CheckCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Tech card */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-7 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <div className="font-semibold text-white">Technicians</div>
                <div className="text-xs text-white/40">Fast workflows in the field</div>
              </div>
            </div>
            <ul className="space-y-2.5">
              {[
                "Assigned jobs and site details on mobile",
                "Device-by-device testing and results",
                "Fire alarm inspection forms",
                "Sprinkler ITM checks and system data",
                "Offline mode with automatic sync",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-white/65">
                  <CheckCircle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </section>

      {/* ── Core Modules ─────────────────────────────────────────────────── */}
      <section className="bg-white/[0.03] border-y border-white/10 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold mb-10 text-center">Core modules</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Flame,         label: "Fire Alarm Inspections", desc: "Template-driven checklists with numeric results, N/A logic, and section-level sign-off.",         accent: "text-red-400",     bg: "bg-red-500/10" },
              { icon: Activity,      label: "Sprinkler ITM",           desc: "Multi-system ITM forms for water supply, sprinkler heads, and riser details.",                     accent: "text-blue-400",    bg: "bg-blue-500/10" },
              { icon: Wrench,        label: "Work Orders",             desc: "Priority-flagged work orders linked to sites, technicians, and deficiency records.",               accent: "text-orange-400",  bg: "bg-orange-500/10" },
              { icon: AlertTriangle, label: "Deficiency Management",   desc: "Track open deficiencies from creation through follow-up, with photos and tech notes.",             accent: "text-yellow-400",  bg: "bg-yellow-500/10" },
              { icon: MapPin,        label: "Site Records",            desc: "Full site and customer records, device inventories, files, and inspection history.",               accent: "text-emerald-400", bg: "bg-emerald-500/10" },
              { icon: BarChart3,     label: "Reports",                 desc: "PDF inspection reports for fire alarm and sprinkler, generated directly from field data.",         accent: "text-violet-400",  bg: "bg-violet-500/10" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3 hover:bg-white/[0.08] transition-colors">
                <div className={`w-9 h-9 rounded-lg ${m.bg} flex items-center justify-center`}>
                  <m.icon className={`h-4.5 w-4.5 ${m.accent}`} />
                </div>
                <div className="font-semibold text-sm text-white">{m.label}</div>
                <p className="text-xs text-white/45 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center space-y-5">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
            <Shield className="h-7 w-7 text-red-400" />
          </div>
        </div>
        <h2 className="text-3xl lg:text-4xl font-bold max-w-2xl mx-auto leading-tight">
          Built for real fire protection operations.
        </h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto leading-relaxed">
          Give office teams and technicians one connected place for sites, schedules, inspections,
          deficiencies, work orders, and reports.
        </p>
        <div className="pt-2">
          <a href={getLoginUrl()}>
            <Button size="lg" className="bg-red-600 hover:bg-red-500 text-white font-semibold px-10 gap-2">
              Open Inspectra <ArrowRight className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/25">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-red-400/60" />
            <span>Inspectra — Fire Protection Operations</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wifi className="h-3 w-3" />
            <span>Offline-capable mobile PWA</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
