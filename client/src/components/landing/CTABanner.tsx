import { ArrowRight } from 'lucide-react'
import { getLoginUrl } from '@/const'

export default function LandingCTABanner() {
  return (
    <section className="py-24 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500">
      <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-12 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
          Ready to start your inspection?
        </h2>
        <p className="text-brand-100 text-lg mb-10 max-w-xl mx-auto">
          Open the Inspectra application to access your assigned inspections, reports,
          and team dashboard.
        </p>
        <a
          href={getLoginUrl()}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-brand-700 font-bold text-lg hover:bg-brand-50 active:bg-brand-100 transition-colors shadow-xl shadow-brand-900/30"
        >
          Open Inspectra
          <ArrowRight className="w-5 h-5" />
        </a>
        <p className="mt-4 text-brand-200 text-sm">
          Need access? Contact your organisation administrator.
        </p>
      </div>
    </section>
  )
}
