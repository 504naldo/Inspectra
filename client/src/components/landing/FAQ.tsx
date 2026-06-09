import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: 'Can inspectors use Inspectra offline?',
    a: 'Yes. The mobile and tablet apps fully support offline mode. Inspectors can complete entire checklists, attach photos, and flag issues with no internet connection. All data syncs automatically when the device reconnects.',
  },
  {
    q: 'What types of inspection templates are supported?',
    a: 'Inspectra supports any inspection type — safety audits, environmental checks, quality control, equipment maintenance, property condition assessments, and more. Templates are fully customisable with text, numeric, yes/no, multiple-choice, photo, and signature fields.',
  },
  {
    q: 'How are reports generated and shared?',
    a: 'Reports are generated automatically when an inspection is submitted. You receive a branded PDF that includes all checklist responses, photos, inspector signatures, and timestamps. Reports can be emailed directly from the platform or downloaded for your records.',
  },
  {
    q: 'Is Inspectra suitable for regulatory compliance use cases?',
    a: 'Yes. Inspectra keeps an immutable, time-stamped audit trail of every inspection and every change. This record can be exported for regulatory audits, litigation support, or ISO certification evidence.',
  },
  {
    q: 'How do I get access to the Inspectra application?',
    a: "Access is managed by your organisation's administrator. Once you have been added to your organisation's account, you can sign in by clicking the \"Open Inspectra\" button above. Contact your administrator if you need credentials or have trouble signing in.",
  },
  {
    q: 'What devices are supported?',
    a: 'Inspectra works on any modern web browser (desktop and laptop), and native apps are available for iOS and Android tablets and phones. No special hardware is required.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-slate-900 font-medium text-base">{q}</span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-5 text-slate-500 text-sm leading-relaxed pr-8">
          {a}
        </div>
      )}
    </div>
  )
}

export default function LandingFAQ() {
  return (
    <section id="faq" className="py-24 bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="text-center mb-12">
          <div className="text-brand-600 text-sm font-semibold uppercase tracking-widest mb-3">
            FAQ
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
            Frequently asked questions
          </h2>
          <p className="text-slate-500 text-lg">
            Can't find your answer? Reach out to your administrator or our support team.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 sm:px-8">
          {FAQS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  )
}
