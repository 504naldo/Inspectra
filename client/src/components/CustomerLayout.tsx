import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { APP_NAME } from "../../../shared/constants";
import { Button } from "@/components/ui/button";
import { Shield, LogOut, Menu, X } from "lucide-react";
import { Link, useLocation } from "wouter";

const NAV = [
  { label: "Dashboard",     href: "/customer"              },
  { label: "Sites",         href: "/customer/sites"        },
  { label: "Reports",       href: "/customer/reports"      },
  { label: "Deficiencies",  href: "/customer/deficiencies" },
];

interface CustomerLayoutProps {
  children: React.ReactNode;
}

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background">
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
            <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[140px]">
              {user?.name}
            </span>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Log out">
              <LogOut className="h-5 w-5" />
            </Button>
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
            </nav>
          </div>
        )}
      </header>

      <main className="container py-6">{children}</main>
    </div>
  );
}
