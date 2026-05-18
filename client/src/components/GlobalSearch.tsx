import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Search,
  Building2,
  MapPin,
  ClipboardList,
  Wrench,
  CheckSquare,
  FileText,
  ScrollText,
  Package,
  AlertTriangle,
  FileCheck2,
  ShieldAlert,
  CalendarDays,
  ReceiptText,
  ClipboardCheck,
} from "lucide-react";

// ─── Quick actions shown when the input is empty ──────────────────────────────

const QUICK_ACTIONS = [
  { label: "Schedule",             href: "/admin/schedule",     icon: CalendarDays  },
  { label: "Jobs",                 href: "/admin/jobs",         icon: ClipboardList },
  { label: "Invoices",             href: "/admin/invoices",     icon: ReceiptText   },
  { label: "Reports",              href: "/admin/reports",      icon: FileText      },
  { label: "Compliance",           href: "/admin/compliance",   icon: ClipboardCheck },
  { label: "New Quote",            href: "/admin/quotes",       icon: FileText      },
  { label: "New Repair Quote",     href: "/admin/repair-quotes/new", icon: FileText },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset query when closed
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const enabled = debouncedQuery.length >= 2;

  const { data, isFetching } = trpc.globalSearch.search.useQuery(
    { q: debouncedQuery },
    { enabled },
  );

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  const showQuickActions = query.length < 2;
  const isSearching = query.length >= 2 && isFetching;
  const hasResults = data && Object.values(data).some((arr) => arr.length > 0);

  let emptyText = "Type at least 2 characters to search…";
  if (query.length >= 2 && !isFetching && !hasResults) emptyText = "No results found.";
  if (isSearching) emptyText = "Searching…";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:flex items-center gap-2 text-muted-foreground px-2 h-9 text-sm"
        onClick={() => setOpen(true)}
        aria-label="Search (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline text-xs">Search</span>
        <kbd className="hidden md:inline pointer-events-none select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search across all entities</DialogDescription>
        </DialogHeader>
        <DialogContent className="overflow-hidden p-0 max-w-xl">
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input]]:h-12">
            <CommandInput
              ref={inputRef}
              placeholder="Search customers, jobs, invoices, reports…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[60vh]">
              {showQuickActions && (
                <CommandGroup heading="Quick access">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <CommandItem
                        key={action.href}
                        value={action.href}
                        onSelect={() => go(action.href)}
                      >
                        <Icon className="h-4 w-4 opacity-60" />
                        {action.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {!showQuickActions && !hasResults && (
                <CommandEmpty>{emptyText}</CommandEmpty>
              )}

              {data?.customers && data.customers.length > 0 && (
                <CommandGroup heading="Customers">
                  {data.customers.map((c) => (
                    <CommandItem
                      key={`customer-${c.id}`}
                      value={`customer-${c.id}`}
                      onSelect={() => go("/admin/customers")}
                    >
                      <Building2 className="h-4 w-4 opacity-60" />
                      <span className="font-medium">{c.name}</span>
                      {c.contactName && (
                        <span className="text-muted-foreground text-xs ml-1">· {c.contactName}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {data?.sites && data.sites.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Sites">
                    {data.sites.map((s) => (
                      <CommandItem
                        key={`site-${s.id}`}
                        value={`site-${s.id}`}
                        onSelect={() => go("/admin/sites")}
                      >
                        <MapPin className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{s.name}</span>
                        {(s.city || s.fileNumber) && (
                          <span className="text-muted-foreground text-xs ml-1">
                            · {[s.city, s.fileNumber].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.jobs && data.jobs.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Jobs">
                    {data.jobs.map((j) => (
                      <CommandItem
                        key={`job-${j.id}`}
                        value={`job-${j.id}`}
                        onSelect={() => go(`/admin/jobs/${j.id}`)}
                      >
                        <ClipboardList className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{j.jobNumber}</span>
                        <span className="text-muted-foreground text-xs ml-1 truncate">· {j.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.workOrders && data.workOrders.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Work Orders">
                    {data.workOrders.map((w) => (
                      <CommandItem
                        key={`wo-${w.id}`}
                        value={`wo-${w.id}`}
                        onSelect={() => go("/admin/work-orders")}
                      >
                        <Wrench className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{w.workOrderNumber}</span>
                        <span className="text-muted-foreground text-xs ml-1 truncate">· {w.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.approvedWork && data.approvedWork.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Approved Work">
                    {data.approvedWork.map((a) => (
                      <CommandItem
                        key={`aw-${a.id}`}
                        value={`aw-${a.id}`}
                        onSelect={() => go(`/admin/approved-work/${a.id}`)}
                      >
                        <CheckSquare className="h-4 w-4 opacity-60" />
                        <span className="font-medium truncate">{a.approvedScope ?? `Approved Work #${a.id}`}</span>
                        {a.approvedByName && (
                          <span className="text-muted-foreground text-xs ml-1">· {a.approvedByName}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.invoices && data.invoices.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Invoices">
                    {data.invoices.map((inv) => (
                      <CommandItem
                        key={`inv-${inv.id}`}
                        value={`inv-${inv.id}`}
                        onSelect={() => go(`/admin/invoices/${inv.id}`)}
                      >
                        <ReceiptText className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{inv.invoiceNumber}</span>
                        {inv.billToName && (
                          <span className="text-muted-foreground text-xs ml-1">· {inv.billToName}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.agreements && data.agreements.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Service Agreements">
                    {data.agreements.map((ag) => (
                      <CommandItem
                        key={`ag-${ag.id}`}
                        value={`ag-${ag.id}`}
                        onSelect={() => go(`/admin/service-agreements/${ag.id}`)}
                      >
                        <ScrollText className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{ag.name}</span>
                        {ag.agreementNumber && (
                          <span className="text-muted-foreground text-xs ml-1">· {ag.agreementNumber}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.inventory && data.inventory.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Inventory">
                    {data.inventory.map((item) => (
                      <CommandItem
                        key={`inv-item-${item.id}`}
                        value={`inv-item-${item.id}`}
                        onSelect={() => go("/admin/inventory")}
                      >
                        <Package className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{item.name}</span>
                        {item.sku && (
                          <span className="text-muted-foreground text-xs ml-1">· {item.sku}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.devices && data.devices.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Devices">
                    {data.devices.map((d) => (
                      <CommandItem
                        key={`dev-${d.id}`}
                        value={`dev-${d.id}`}
                        onSelect={() => go("/admin/devices")}
                      >
                        <AlertTriangle className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{d.label ?? d.deviceType}</span>
                        {d.serialNumber && (
                          <span className="text-muted-foreground text-xs ml-1">· S/N {d.serialNumber}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.reports && data.reports.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Reports">
                    {data.reports.map((r) => (
                      <CommandItem
                        key={`rep-${r.id}`}
                        value={`rep-${r.id}`}
                        onSelect={() => go("/admin/reports")}
                      >
                        <FileCheck2 className="h-4 w-4 opacity-60" />
                        <span className="font-medium">{r.reportNumber}</span>
                        <span className="text-muted-foreground text-xs ml-1 truncate">· {r.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {data?.deficiencies && data.deficiencies.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Deficiencies">
                    {data.deficiencies.map((def) => (
                      <CommandItem
                        key={`def-${def.id}`}
                        value={`def-${def.id}`}
                        onSelect={() => go(`/admin/jobs/${def.jobId}`)}
                      >
                        <ShieldAlert className="h-4 w-4 opacity-60" />
                        <span className="font-medium truncate">{def.title}</span>
                        <span className="text-muted-foreground text-xs ml-1">· Job #{def.jobId}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
