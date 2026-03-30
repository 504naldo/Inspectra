import { useAuth } from "@/_core/hooks/useAuth";
import { APP_NAME } from "../../../shared/constants";
import { Button } from "@/components/ui/button";
import {
  Shield,
  LogOut,
  Menu,
  X,
  ClipboardList,
  Users,
  Building2,
  AlertTriangle,
  FileText,
  TrendingUp,
  CalendarDays,
  FolderOpen
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const navItems = [
  { label: "Dashboard", href: "/admin", icon: TrendingUp },
  { label: "Jobs", href: "/admin/jobs", icon: ClipboardList },
  { label: "Customers", href: "/admin/customers", icon: Building2 },
  { label: "Sites", href: "/admin/sites", icon: Building2 },
  { label: "Devices", href: "/admin/devices", icon: AlertTriangle },
  { label: "Schedule", href: "/admin/schedule", icon: CalendarDays },
  { label: "Reports", href: "/admin/reports", icon: FileText },
  { label: "Customer Records", href: "/admin/customer-records", icon: FolderOpen },
  { label: "Users", href: "/admin/users", icon: Users, adminOnly: true },
];

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const filteredNavItems = navItems.filter(item => 
    !item.adminOnly || user?.role === 'admin'
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <div className="flex items-center gap-2 cursor-pointer">
                <Shield className="h-7 w-7 text-primary" />
                <span className="font-bold text-lg hidden sm:inline">{APP_NAME}</span>
              </div>
            </Link>
          </div>
          
          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {filteredNavItems.map(item => (
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

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.name}
            </span>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-card">
            <nav className="container py-4 space-y-1">
              {filteredNavItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button 
                      variant={location === item.href ? "secondary" : "ghost"} 
                      className="w-full justify-start"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      <main className="container py-6">
        {title && (
          <h1 className="text-2xl font-bold mb-6">{title}</h1>
        )}
        {children}
      </main>
      
      {/* Environment Indicator */}
      <div className="fixed bottom-4 right-4 bg-primary/10 text-primary text-xs px-2 py-1 rounded border border-primary/20">
        {import.meta.env.MODE === 'production' ? 'PROD' : 'DEV'} | DB: {user?.companyId || 'N/A'}
      </div>
    </div>
  );
}
