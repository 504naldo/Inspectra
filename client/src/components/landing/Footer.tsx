import { Search } from 'lucide-react'
import { getLoginUrl } from '@/const'

const NAV_GROUPS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Contact', href: '#' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '#' },
      { label: 'Terms of Service', href: '#' },
      { label: 'Cookie Policy', href: '#' },
    ],
  },
]

export default function LandingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div>
            <a href="#" className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <Search className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-white text-lg tracking-tight">Inspectra</span>
            </a>
            <p className="text-sm leading-relaxed text-slate-400 mb-5">
              Field inspection and quality management for modern teams.
            </p>
            <a
              href={getLoginUrl()}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              Open Inspectra →
            </a>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <h4 className="text-white text-sm font-semibold mb-4">{group.heading}</h4>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <p>© {year} Inspectra. All rights reserved.</p>
          <p>Built for inspection teams that demand reliability.</p>
        </div>
      </div>
    </footer>
  )
}
