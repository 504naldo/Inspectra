import { Loader2 } from 'lucide-react'
import { useAuth } from '@/_core/hooks/useAuth'
import { getLoginUrl, INSPECTRA_WEBSITE_URL } from '@/const'

/**
 * Application entry screen.
 *
 * The full marketing website lives in its own repository (504naldo/inspectra-website);
 * this app intentionally ships only a lightweight entry point, not a duplicated
 * marketing site. Authenticated users are redirected to their role dashboard by the
 * root auth guard in App.tsx — here we just show a brief loader to avoid flashing the
 * entry screen during that redirect.
 */
export default function Home() {
  const { user, loading, isAuthenticated } = useAuth()

  if (loading || (isAuthenticated && user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-950 px-6 py-10 text-center text-white">
      <img
        src="/inspectra-logo-cut.png"
        alt="Inspectra"
        className="w-44 max-w-[70vw]"
      />
      <p className="max-w-md text-sm leading-relaxed text-white/70">
        The secure operating system for fire protection inspection and service teams.
      </p>
      <a
        href={getLoginUrl()}
        className="inline-flex items-center justify-center rounded-md bg-card px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-card/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        Sign in to Inspectra
      </a>
      {INSPECTRA_WEBSITE_URL && (
        <a
          href={INSPECTRA_WEBSITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/40 transition hover:text-white/70"
        >
          Visit our website
        </a>
      )}
    </div>
  )
}
