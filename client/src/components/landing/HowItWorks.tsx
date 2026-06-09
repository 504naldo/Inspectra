import { ClipboardList, Search, FileText, TrendingUp } from 'lucide-react'

const STEPS = [
  {
    number: '01',
    icon: ClipboardList,
    title: 'Build your template',
    description:
      'Use the drag-and-drop builder to create inspection checklists tailored to your sites, standards, and regulations. Reuse templates across your entire portfolio.',
  },
  {
    number: '02',
    icon: Search,
    title: 'Conduct the inspection',
    description:
      'Inspectors open the assignment on any device, work through each checkpoint, attach photos, and flag issues — even offline in areas with no connectivity.',
  },
  {
    number: '03',
    icon: FileText,
    title: 'Generate & share the report',
    description:
      'When the inspection is submitted, a professional branded PDF report is generated instantly and delivered to the relevant stakeholders.',
  },
  {
    number: '04',
    icon: TrendingUp,
    title: 'Track & improve',
    description:
      'Dashboards aggregate findings across all sites and inspections. Identify recurring failures, monitor remediation progress, and demonstrate compliance.',
  },
]

export default function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-brand-600 text-sm font-semibold uppercase tracking-widest mb-3">
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
            From site visit to signed report in minutes
          </h2>
          <p className="text-slate-500 text-lg">
            Inspectra guides your team through every step, so nothing is missed
            and everything is documented.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-12 left-[calc(12.5%+1.5rem)] right-[calc(12.5%+1.5rem)] h-px bg-brand-200" />

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((step) => {
              const Icon = step.icon
              return (
                <div key={step.number} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 w-24 h-24 rounded-2xl bg-white border-2 border-brand-200 shadow-md flex flex-col items-center justify-center mb-6">
                    <span className="text-xs font-bold text-brand-400 leading-none mb-1">
                      {step.number}
                    </span>
                    <Icon className="w-6 h-6 text-brand-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-lg mb-2">{step.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{step.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
