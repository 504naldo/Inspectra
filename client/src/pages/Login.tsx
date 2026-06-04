import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { getPostLoginPath } from "@/lib/roleRedirect";
import "./Login.css";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

function IconApple() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function IconEye({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Login() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("returnTo") || undefined;
  }, []);

  const loginUrl = useMemo(() => getLoginUrl(returnTo), [returnTo]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      setLocation(getPostLoginPath(user.role, returnTo));
    }
  }, [loading, isAuthenticated, user, returnTo, setLocation]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#02081a" }}>
        <div style={{ width: 40, height: 40, border: "3px solid rgba(56,182,255,0.3)", borderTopColor: "#38b6ff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("Email/password login is not yet available. Please use Google Sign In above.");
  };

  return (
    <div className="login-stage" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", height: "100vh", width: "100%", fontFamily: "'Manrope', system-ui, sans-serif", background: "#02081a", color: "#eaf2fb", WebkitFontSmoothing: "antialiased" }}>

      {/* ── Brand panel ── */}
      <div className="login-brand">
        <div className="login-sweep" />

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 1 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#6fce52", boxShadow: "0 0 12px 1px rgba(111,206,82,0.8)", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, letterSpacing: "0.22em", textTransform: "uppercase", color: "#8ea6c4", whiteSpace: "nowrap" }}>
            INSPECTRA PLATFORM
          </span>
        </div>

        {/* Center logo + tagline */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 28, margin: "auto 0", position: "relative", zIndex: 1 }}>
          <img
            src="/inspectra-logo-cut.png"
            alt="Inspectra"
            style={{ width: "min(440px, 80%)", filter: "drop-shadow(0 20px 50px rgba(0,0,0,0.5))" }}
          />
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: "clamp(20px, 2vw, 27px)", lineHeight: 1.32, maxWidth: "18ch", textWrap: "balance" as any, color: "#eaf2fb" }}>
            The command center for{" "}
            <span className="login-tagline-accent">fire &amp; life-safety</span>{" "}
            inspections.
          </p>
        </div>

        {/* Trust pills */}
        <div style={{ display: "flex", gap: 30, color: "#5d738f", fontSize: 12.5, position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <IconShield />
            <span><strong style={{ color: "#8ea6c4" }}>SOC 2</strong> Type II</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <IconCheck />
            <span>NFPA-aligned workflows</span>
          </div>
        </div>
      </div>

      {/* ── Auth panel ── */}
      <div className="login-auth-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "linear-gradient(180deg, #0a1936 0%, #07142f 100%)", overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 384 }}>

          {/* Mobile logo (hidden on desktop via CSS) */}
          <div className="login-mobile-logo" style={{ display: "none", justifyContent: "center", marginBottom: 28 }}>
            <img src="/inspectra-logo-cut.png" alt="Inspectra" style={{ width: 180 }} />
          </div>

          {/* Heading */}
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 30, letterSpacing: "-0.01em", color: "#fff", textAlign: "center", marginBottom: 10 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14.5, color: "#8ea6c4", lineHeight: 1.5, textAlign: "center", maxWidth: "33ch", margin: "0 auto 28px" }}>
            Sign in to your Inspectra workspace to manage inspections, deficiencies, and compliance.
          </p>

          {/* Social sign-in */}
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 20 }}>
            <a href={loginUrl} className="login-sso-btn">
              <IconGoogle />
              Continue with Google
            </a>
            <button className="login-sso-btn" disabled title="Coming soon">
              <IconApple />
              Continue with Apple
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(120,160,210,0.14)" }} />
            <span style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5d738f", whiteSpace: "nowrap" }}>
              OR SIGN IN WITH EMAIL
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(120,160,210,0.14)" }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Email field */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#8ea6c4", marginBottom: 8 }}>
                Work email
              </label>
              <input
                className="login-input"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Password field */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#8ea6c4" }}>
                  Password
                </label>
                <a href="/forgot-password" style={{ fontSize: 12.5, fontWeight: 600, color: "#38b6ff", textDecoration: "none" }}>
                  Forgot password?
                </a>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className="login-input login-input-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 0, top: 0, width: 40, height: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: "#5d738f", cursor: "pointer", borderRadius: "0 11px 11px 0" }}
                >
                  <IconEye open={showPassword} />
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                className="login-checkbox"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span style={{ fontSize: 13.5, color: "#8ea6c4" }}>Keep me signed in on this device</span>
            </label>

            {/* Error */}
            {emailError && (
              <p style={{ fontSize: 13, color: "#e5484d", lineHeight: 1.4, padding: "10px 12px", background: "rgba(229,72,77,0.08)", border: "1px solid rgba(229,72,77,0.25)", borderRadius: 8 }}>
                {emailError}
              </p>
            )}

            {/* Submit */}
            <button type="submit" className="login-submit-btn" style={{ marginTop: 4 }}>
              Sign in
              <IconArrow />
            </button>
          </form>

          {/* Footer */}
          <p style={{ marginTop: 20, textAlign: "center", fontSize: 13.5, color: "#8ea6c4" }}>
            Don't have access yet?{" "}
            <a href="/request-access" style={{ color: "#38b6ff", fontWeight: 600, textDecoration: "none" }}>
              Request an account
            </a>
          </p>
          <p style={{ marginTop: 14, textAlign: "center", fontSize: 11.5, color: "#5d738f", lineHeight: 1.6 }}>
            By signing in you agree to Inspectra's{" "}
            <a href="/terms" style={{ color: "#8ea6c4", textDecoration: "none" }}>Terms</a>
            {" "}and{" "}
            <a href="/privacy" style={{ color: "#8ea6c4", textDecoration: "none" }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
