import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePortalPreview } from "@/contexts/PortalPreviewContext";
import { APP_NAME } from "../../../shared/constants";
import { Button } from "@/components/ui/button";
import { Shield, LogOut, Menu, X, ArrowLeft, Eye, Settings } from "lucide-react";
import { Link, useLocation } from "wouter";

const NAV = [
  { label: "Dashboard",     href: "/customer"              },
  { label: "Sites",         href: "/customer/sites"        },
  { label: "Reports",       href: "/customer/reports"      },
  { label: "Deficiencies",  href: "/customer/deficiencies" },
  { label: "Settings",      href: "/customer/settings"     },
];

interface CustomerLayoutProps {
  children: React.ReactNode;
}

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const { user, logout } = useAuth();
  const { previewOrg, setPreviewOrg } = usePortalPreview();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPreview = !!previewOrg && (user?.role === "admin" || user?.role === "office");

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const handleExitPreview = () => {
    setPreviewOrg(null);
    setLocation("/admin/customers");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Preview banner */}
      {isPreview && (
        <div className="bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 shrink-0" />
            <span>
              Previewing <strong>{previewOrg.name}</strong>'s customer portal — changes here don't affect real customers
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-amber-900 border-amber-300 bg-amber-100 hover:bg-amber-200 shrink-0"
            onClick={handleExitPreview}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Exit Preview
          </Button>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center justify-between gap-4">
          {/* Brand */}
          <Link href="/customer">
            <div className="flex items-center gap-2 cursor-pointer shrink-0">
              <Shield className="h-7 w-7 text-primary" />
              <span className="font-bold text-lg hidden sm:inline">{APP_NAME}</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={location === item.href ? "secondary" : "ghost"}
                  size="sm"
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            {!isPreview && (
              <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[140px]">
                {user?.name}
              </span>
            )}
            {isPreview ? (
              <Button variant="outline" size="sm" onClick={handleExitPreview}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Admin
              </Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Log out">
                <LogOut className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-card">
            <nav className="container py-3 flex flex-col gap-1">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={location === item.href ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}
              {isPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start mt-2"
                  onClick={() => { setMobileOpen(false); handleExitPreview(); }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Exit Preview
                </Button>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="container py-6">{children}</main>
    </div>
  );
}
