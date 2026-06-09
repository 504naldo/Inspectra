import { ArrowRight, CheckCircle } from 'lucide-react'
import { getLoginUrl } from '@/const'

const HIGHLIGHTS = [
  'No paper forms, no email chains',
  'Real-time dashboards for every site',
  'Instant PDF reports in one click',
]

export default function LandingHero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-brand-950 to-slate-900 pt-16">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600 rounded-full blur-3xl opacity-10 -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-brand-400 rounded-full blur-3xl opacity-10 translate-x-1/2 translate-y-1/2" />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-8 lg:px-12 py-20 lg:py-28 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-600/20 border border-brand-500/30 text-brand-300 text-xs font-semibold uppercase tracking-widest mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          Field Inspection Platform
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight text-white mb-6">
          Every inspection.{' '}
          <span className="gradient-text">Every finding.</span>{' '}
          Every team.
        </h1>

        <p className="text-lg text-slate-300 leading-relaxed mb-8 max-w-2xl mx-auto">
          Inspectra gives field teams a single platform to plan inspections,
          capture findings with photos and notes, and deliver instant,
          professional reports — from any device, on any site.
        </p>

        <ul className="space-y-3 mb-10 inline-block text-left">
          {HIGHLIGHTS.map((item) => (
            <li key={item} className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-brand-400 flex-shrink-0" />
              <span className="text-slate-300 text-sm">{item}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={getLoginUrl()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-500 active:bg-brand-700 transition-colors shadow-lg shadow-brand-900/40 text-base"
          >
            Open Inspectra
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-colors text-base"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  )
}
