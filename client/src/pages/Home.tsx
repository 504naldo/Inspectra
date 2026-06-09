import { Loader2 } from 'lucide-react'
import { useAuth } from '@/_core/hooks/useAuth'
import LandingNavbar from '@/components/landing/Navbar'
import LandingHero from '@/components/landing/Hero'
import LandingFeatures from '@/components/landing/Features'
import LandingHowItWorks from '@/components/landing/HowItWorks'
import LandingFAQ from '@/components/landing/FAQ'
import LandingCTABanner from '@/components/landing/CTABanner'
import LandingFooter from '@/components/landing/Footer'

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
    <div className="min-h-screen font-sans antialiased text-slate-900 bg-white">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingFAQ />
        <LandingCTABanner />
      </main>
      <LandingFooter />
    </div>
  )
}
