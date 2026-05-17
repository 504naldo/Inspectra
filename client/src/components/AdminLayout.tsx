import { useAuth } from "@/_core/hooks/useAuth";
import { APP_NAME } from "../../../shared/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ClipboardList,
  Users,
  Building2,
  AlertTriangle,
  FileText,
  TrendingUp,
  CalendarDays,
  FolderOpen,
  Wrench,
  ReceiptText,
  CheckSquare,
  Settings,
  ShieldAlert,
  Upload,
  Bell,
  ClipboardCheck,
  Zap,
  Bot,
  BookOpen,
  ScrollText,
  Activity,
  Package,
  ShoppingCart,
  Store,
  ClipboardPen,
  Clock,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

// Primary nav — always visible in the desktop header (kept short so they fit at lg/1024px)
const primaryNavItems = [
  { label: "Dashboard",  href: "/admin",           icon: TrendingUp   },
  { label: "Jobs",       href: "/admin/jobs",       icon: ClipboardList },
  { label: "Customers",  href: "/admin/customers",  icon: Building2    },
  { label: "Sites",      href: "/admin/sites",      icon: Building2    },
  { label: "Schedule",   href: "/admin/schedule",   icon: CalendarDays },
  { label: "Reports",    href: "/admin/reports",    icon: FileText     },
];

// Secondary nav — collapsed into "More" on desktop, visible in mobile drawer
const secondaryNavItems = [
  { label: "Agreements",        href: "/admin/service-agreements",      icon: ScrollText,     adminOnly: false },
  { label: "Asset Lifecycle",  href: "/admin/asset-lifecycle",         icon: Activity,       adminOnly: false },
  { label: "Inventory",        href: "/admin/inventory",               icon: Package,        adminOnly: false },
  { label: "Parts Requests",   href: "/admin/parts-requests",          icon: ShoppingCart,   adminOnly: false },
  { label: "Vendors",          href: "/admin/vendors",                 icon: Store,          adminOnly: false },
  { label: "Purchase Orders",  href: "/admin/purchase-orders",         icon: ClipboardPen,   adminOnly: false },
  { label: "Timesheets",       href: "/admin/timesheets",              icon: Clock,          adminOnly: false },
  { label: "Approved Work",    href: "/admin/approved-work",          icon: CheckSquare,    adminOnly: false },
  { label: "Auto Schedule",   href: "/admin/scheduling-automation",  icon: Zap,            adminOnly: false },
  { label: "AI Assistant",    href: "/admin/ai-assistant",           icon: Bot,            adminOnly: false },
  { label: "AI Knowledge",    href: "/admin/knowledge-base",         icon: BookOpen,       adminOnly: false },
  { label: "Report QA",       href: "/admin/report-qa",              icon: ClipboardCheck, adminOnly: false },
  { label: "Compliance",      href: "/admin/compliance",             icon: ShieldAlert,    adminOnly: false },
  { label: "Documents",       href: "/admin/documents",        icon: FolderOpen,     adminOnly: false },
  { label: "Quotes",           href: "/admin/quotes",           icon: ReceiptText,   adminOnly: false },
  { label: "Work Orders",      href: "/admin/work-orders",      icon: Wrench,        adminOnly: false },
  { label: "Invoices",         href: "/admin/invoices",         icon: FileText,      adminOnly: false },
  { label: "Customer Records", href: "/admin/customer-records", icon: FolderOpen,   adminOnly: false },
  { label: "Devices",          href: "/admin/devices",          icon: AlertTriangle, adminOnly: false },
  { label: "Data Quality",     href: "/admin/data-quality",     icon: ShieldAlert,   adminOnly: false },
  { label: "Imports",          href: "/admin/imports",          icon: Upload,        adminOnly: false },
  { label: "Users",            href: "/admin/users",            icon: Users,         adminOnly: true  },
  { label: "Settings",         href: "/admin/settings",         icon: Settings,      adminOnly: false },
];

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: unreadCount = 0 } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
    enabled: !!user?.companyId,
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const visibleSecondary = secondaryNavItems.filter(
    (item) => !item.adminOnly || user?.role === "admin"
  );

  const allNavItems = [...primaryNavItems, ...visibleSecondary];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-4">

          {/* Brand */}
          <Link href="/admin">
            <div className="flex items-center gap-2 cursor-pointer shrink-0">
              <Shield className="h-7 w-7 text-primary" />
              <span className="font-bold text-lg hidden sm:inline">{APP_NAME}</span>
            </div>
          </Link>

          {/* Desktop nav — fills available space; overflow-hidden hard-stops spill */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
            {primaryNavItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={location === item.href ? "secondary" : "ghost"}
                  size="sm"
                  className="whitespace-nowrap shrink-0"
                >
                  {item.label}
                </Button>
              </Link>
            ))}

            {/* "More" overflow dropdown */}
            {visibleSecondary.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={
                      visibleSecondary.some((i) => location === i.href)
                        ? "secondary"
                        : "ghost"
                    }
                    size="sm"
                    className="whitespace-nowrap shrink-0"
                  >
                    More
                    <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {visibleSecondary.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href}>
                        <DropdownMenuItem
                          className={
                            location === item.href ? "bg-accent font-medium" : ""
                          }
                        >
                          <Icon className="h-4 w-4 mr-2 opacity-70" />
                          {item.label}
                        </DropdownMenuItem>
                      </Link>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          {/* Right side: user name + bell + logout + mobile toggle */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[140px]">
              {user?.name}
            </span>
            <Link href="/admin/notifications">
              <Button variant="ghost" size="icon" title="Notifications" className="relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Log out">
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

        {/* ── Mobile nav drawer ─────────────────────────────────────────── */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-card">
            <nav className="container py-4 space-y-1">
              {allNavItems.map((item) => {
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
        {title && <h1 className="text-2xl font-bold mb-6">{title}</h1>}
        {children}
      </main>

      {/* Environment indicator */}
      <div className="fixed bottom-4 right-4 bg-primary/10 text-primary text-xs px-2 py-1 rounded border border-primary/20">
        {import.meta.env.MODE === "production" ? "PROD" : "DEV"} | DB:{" "}
        {user?.companyId || "N/A"}
      </div>
    </div>
  );
}
