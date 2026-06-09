import { ClipboardList, Camera, FileText, BarChart2, Bell, ShieldCheck } from 'lucide-react'

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Structured Checklists',
    description:
      'Build inspection templates once, deploy them everywhere. Every inspector follows the same proven workflow — on desktop, tablet, or phone.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Camera,
    title: 'Photo Evidence Capture',
    description:
      'Attach geo-tagged photos and videos directly to any finding. Visual evidence is automatically organised and stored with the inspection record.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: FileText,
    title: 'Instant PDF Reports',
    description:
      'Generate branded, professional PDF reports in a single click. Share with clients or stakeholders the moment an inspection closes.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: BarChart2,
    title: 'Live Analytics',
    description:
      'Track findings trends, compliance rates, and team productivity on real-time dashboards. Spot recurring issues before they become serious.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Bell,
    title: 'Automated Alerts',
    description:
      'Critical findings trigger instant notifications to the right people. Define escalation rules by severity, site, or inspection type.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    icon: ShieldCheck,
    title: 'Audit-Ready Records',
    description:
      'Every inspection is time-stamped, signed, and immutably stored. Pass regulatory audits with complete, tamper-evident inspection history.',
    color: 'bg-indigo-50 text-indigo-600',
  },
]

export default function LandingFeatures() {
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-brand-600 text-sm font-semibold uppercase tracking-widest mb-3">
            Features
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
            Everything your inspection workflow needs
          </h2>
          <p className="text-slate-500 text-lg">
            From a single checklist item to a full multi-site compliance programme,
            Inspectra adapts to how your team works.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="group rounded-2xl border border-slate-100 p-6 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-50 transition-all duration-200"
              >
                <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl ${f.color} mb-4`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-slate-900 font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
