import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { APP_NAME } from "../../../shared/constants";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
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
  CalendarCheck,
  FileCheck2,
  CalendarOff,
  MessageSquare,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { FeedbackButton } from "@/components/FeedbackButton";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

// ─── Navigation groups ────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    id: "operations",
    label: "Operations",
    icon: CalendarDays,
    items: [
      { label: "Dashboard",     href: "/admin",                          icon: TrendingUp   },
      { label: "Schedule",      href: "/admin/schedule",                 icon: CalendarDays },
      { label: "Jobs",          href: "/admin/jobs",                     icon: ClipboardList },
      { label: "Approved Work", href: "/admin/approved-work",            icon: CheckSquare  },
      { label: "Work Orders",   href: "/admin/work-orders",              icon: Wrench       },
      { label: "Auto-Schedule", href: "/admin/scheduling-automation",    icon: Zap          },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: Building2,
    items: [
      { label: "Customers",        href: "/admin/customers",        icon: Building2   },
      { label: "Sites",            href: "/admin/sites",            icon: Building2   },
      { label: "Customer Records", href: "/admin/customer-records", icon: FolderOpen  },
      { label: "Agreements",       href: "/admin/service-agreements", icon: ScrollText },
    ],
  },
  {
    id: "field",
    label: "Field Work",
    icon: Clock,
    items: [
      { label: "Devices",        href: "/admin/devices",          icon: AlertTriangle },
      { label: "Asset Lifecycle",href: "/admin/asset-lifecycle",  icon: Activity      },
      { label: "Timesheets",     href: "/admin/timesheets",       icon: Clock         },
      { label: "Payroll Hours",  href: "/admin/payroll-hours",    icon: CalendarCheck },
      { label: "Payroll Review", href: "/admin/payroll-review",   icon: FileCheck2    },
      { label: "Availability",   href: "/admin/availability",     icon: CalendarOff   },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: FileText,
    items: [
      { label: "Reports",      href: "/admin/reports",      icon: FileText     },
      { label: "Report QA",    href: "/admin/report-qa",    icon: ClipboardCheck },
      { label: "Compliance",   href: "/admin/compliance",   icon: ShieldAlert  },
      { label: "Documents",    href: "/admin/documents",    icon: FolderOpen   },
      { label: "Data Quality", href: "/admin/data-quality", icon: ShieldAlert  },
    ],
  },
  {
    id: "financial",
    label: "Financial",
    icon: ReceiptText,
    items: [
      { label: "Invoices",        href: "/admin/invoices",        icon: FileText    },
      { label: "Quotes",          href: "/admin/quotes",          icon: ReceiptText },
      { label: "Purchase Orders", href: "/admin/purchase-orders", icon: ClipboardPen },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    items: [
      { label: "Inventory",      href: "/admin/inventory",       icon: Package     },
      { label: "Parts Catalog",  href: "/admin/parts-catalog",   icon: Package     },
      { label: "Parts Requests", href: "/admin/parts-requests",  icon: ShoppingCart },
      { label: "Vendors",        href: "/admin/vendors",         icon: Store       },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: Settings,
    items: [
      { label: "Users",              href: "/admin/users",                  icon: Users,    adminOnly: true },
      { label: "Settings",           href: "/admin/settings",               icon: Settings                  },
      { label: "Setup Wizard",       href: "/admin/setup",                  icon: CheckSquare               },
      { label: "Access Control",     href: "/admin/access-control",         icon: ShieldAlert               },
      { label: "Inspection Templates", href: "/admin/inspection-templates", icon: ClipboardList             },
      { label: "Imports",         href: "/admin/imports",         icon: Upload                    },
      { label: "Notifications",   href: "/admin/notifications",   icon: Bell                      },
      { label: "AI Assistant",    href: "/admin/ai-assistant",    icon: Bot                       },
      { label: "Knowledge Base",  href: "/admin/knowledge-base",  icon: BookOpen                  },
      { label: "Feedback Center", href: "/admin/feedback",        icon: MessageSquare             },
    ],
  },
];

// ─── Layout ───────────────────────────────────────────────────────────────────

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set<string>());

  const { data: unreadCount = 0 } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
    enabled: !!user?.companyId,
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  // Filter admin-only items for non-admin users
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || user?.role === "admin"),
  })).filter((group) => group.items.length > 0);

  // Active detection — exact match preserves existing behavior for sub-pages
  const isItemActive = (href: string) => location === href;
  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => isItemActive(item.href));

  // Mobile menu open: expand active group, close rest
  const handleMobileToggle = () => {
    if (!mobileMenuOpen) {
      const activeGroupId = visibleGroups.find((g) => isGroupActive(g))?.id;
      setOpenGroups(activeGroupId ? new Set([activeGroupId]) : new Set());
    }
    setMobileMenuOpen((v) => !v);
  };

  const toggleMobileGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-3">

          {/* Brand */}
          <Link href="/admin">
            <div className="flex items-center gap-2 cursor-pointer shrink-0">
              <Shield className="h-7 w-7 text-primary" />
              <span className="font-bold text-lg hidden sm:inline">{APP_NAME}</span>
            </div>
          </Link>

          {/* Desktop nav — one dropdown per group */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
            {visibleGroups.map((group) => {
              const GroupIcon = group.icon;
              const active = isGroupActive(group);
              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={active ? "secondary" : "ghost"}
                      size="sm"
                      className="whitespace-nowrap shrink-0"
                    >
                      {group.label}
                      <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[180px]">
                    <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium py-1">
                      <GroupIcon className="h-3.5 w-3.5" />
                      {group.label}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <Link key={item.href} href={item.href}>
                          <DropdownMenuItem
                            className={isItemActive(item.href) ? "bg-accent font-medium" : ""}
                          >
                            <ItemIcon className="h-4 w-4 mr-2 opacity-70" />
                            {item.label}
                          </DropdownMenuItem>
                        </Link>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          {/* Global search */}
          <div className="ml-auto shrink-0">
            <GlobalSearch />
          </div>

          {/* Right side: user name + bell + logout + mobile toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[140px]">
              {user?.name}
            </span>
            <FeedbackButton variant="outline" size="sm" className="hidden sm:flex shrink-0" />
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
              onClick={handleMobileToggle}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* ── Mobile nav drawer — grouped + collapsible ──────────────────── */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-card max-h-[80vh] overflow-y-auto">
            <nav className="container py-3 space-y-0.5">
              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                const groupActive = isGroupActive(group);
                const isOpen = openGroups.has(group.id) || groupActive;

                return (
                  <div key={group.id}>
                    {/* Group header */}
                    <button
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                        groupActive
                          ? "text-foreground bg-accent/40"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                      }`}
                      onClick={() => toggleMobileGroup(group.id)}
                    >
                      <span className="flex items-center gap-2">
                        <GroupIcon className="h-4 w-4" />
                        {group.label}
                      </span>
                      <ChevronRight
                        className={`h-4 w-4 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                      />
                    </button>

                    {/* Group items */}
                    {isOpen && (
                      <div className="ml-3 pl-3 border-l border-border/50 mt-0.5 mb-1 space-y-0.5">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <Link key={item.href} href={item.href}>
                              <Button
                                variant={isItemActive(item.href) ? "secondary" : "ghost"}
                                size="sm"
                                className="w-full justify-start font-normal"
                                onClick={() => setMobileMenuOpen(false)}
                              >
                                <ItemIcon className="h-4 w-4 mr-2 opacity-70" />
                                {item.label}
                              </Button>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
