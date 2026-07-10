import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2, Shield } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { getPostLoginPath } from "@/lib/roleRedirect";
import { Button } from "@/components/ui/button";

function IconGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}

export default function Login() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("returnTo") || undefined;
  }, []);

  const loginUrl = useMemo(() => getLoginUrl(returnTo), [returnTo]);

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      setLocation(getPostLoginPath(user.role, returnTo));
    }
  }, [loading, isAuthenticated, user, returnTo, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-sm">
        {/* Brand lockup */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Inspectra</h1>
          <p className="mt-2 text-sm text-muted-foreground text-balance">
            Sign in to your workspace to manage inspections, deficiencies, and compliance.
          </p>
        </div>

        {/* Auth card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
          <Button asChild variant="outline" size="lg" className="w-full">
            <a href={loginUrl}>
              <IconGoogle />
              Continue with Google
            </a>
          </Button>
          <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
            Access is managed by your organization&rsquo;s administrator. If you can&rsquo;t sign in,
            contact them to have your account added.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Built for CAN/ULC-S536 &amp; NFPA inspection workflows.
        </p>
      </div>
    </div>
  );
}
