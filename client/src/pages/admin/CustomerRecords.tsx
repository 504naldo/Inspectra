import { useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Search,
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Download,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Building2,
  MapPin,
  ClipboardList,
  AlertTriangle,
  WifiOff,
  Loader2,
  LogIn,
  UserPlus,
  CheckCircle2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(sizeStr?: string): string {
  const bytes = sizeStr ? parseInt(sizeStr, 10) : NaN;
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA");
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "application/vnd.google-apps.folder": "",
    "application/vnd.google-apps.spreadsheet": "GSHEET",
    "application/vnd.google-apps.document": "GDOC",
    "application/vnd.google-apps.presentation": "GSLIDES",
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "application/vnd.ms-excel": "XLS",
    "text/csv": "CSV",
    "image/jpeg": "JPG",
    "image/png": "PNG",
  };
  return map[mimeType] ?? mimeType.split("/").pop()?.toUpperCase() ?? "";
}

function fileIcon(entry: DriveEntry) {
  if (entry.isFolder) return <Folder className="h-4 w-4 text-amber-500" />;
  const m = entry.mimeType;
  if (m.startsWith("image/")) return <FileImage className="h-4 w-4 text-blue-500" />;
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m.includes("csv") ||
    m === "application/vnd.google-apps.spreadsheet"
  )
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (
    m.includes("pdf") ||
    m.includes("word") ||
    m.includes("document") ||
    m === "application/vnd.google-apps.document"
  )
    return <FileText className="h-4 w-4 text-primary" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomerRecords() {
  const { user } = useAuth();

  // Search panel
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  // Folder browser — Drive uses IDs, not paths
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [fileFilter, setFileFilter] = useState("");

  // Download tracking
  const [downloading, setDownloading] = useState<string | null>(null);

  // "Add as customer" dialog — prefilled from a Drive folder's name.
  const [addCustomer, setAddCustomer] = useState<{
    name: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    address: string;
  } | null>(null);
  // Names created from this screen this session, so the button can show "Added".
  const [createdNames, setCreatedNames] = useState<Set<string>>(new Set());
  // Folder currently being read for summary-sheet details (drives the spinner).
  const [extractingFolderId, setExtractingFolderId] = useState<string | null>(null);

  if (!user?.companyId) {
    return (
      <AdminLayout title="Customer Records">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  // ── tRPC queries ─────────────────────────────────────────────────────────

  const { data: status, isLoading: isStatusLoading } =
    trpc.customerRecords.status.useQuery(undefined, {
      retry: false,
      staleTime: 30_000,
    });

  const {
    data: searchResults,
    isLoading: isSearching,
    isFetching: isRefetching,
  } = trpc.customerRecords.search.useQuery(
    { query: submittedQuery },
    { enabled: submittedQuery.length >= 1, retry: false }
  );

  const { data: rootData, isLoading: isLoadingRoot } =
    trpc.customerRecords.listRoot.useQuery(undefined, {
      enabled: !submittedQuery && status?.configured === true && status?.connected === true,
      retry: false,
    });

  const {
    data: folderData,
    isLoading: isLoadingFolder,
    error: folderError,
  } = trpc.customerRecords.listFolder.useQuery(
    { folderId: currentFolderId },
    {
      enabled: currentFolderId !== "" && status?.connected === true,
      retry: false,
    }
  );

  const downloadMutation = trpc.customerRecords.downloadFile.useMutation({
    onSuccess(result) {
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setDownloading(null);
      toast.success(`Downloaded ${result.fileName}`);
    },
    onError(err) {
      setDownloading(null);
      toast.error(err.message || "Download failed");
    },
  });

  // Existing customers — used to prefill / detect duplicates when adding a
  // customer from a Drive folder. utils lets us refetch after a create.
  const utils = trpc.useUtils();
  const { data: existingCustomers } = trpc.customerOrg.list.useQuery(
    { companyId: user.companyId },
    { staleTime: 30_000 }
  );

  const createCustomer = trpc.customerOrg.create.useMutation({
    onSuccess: (created: any) => {
      toast.success(`Customer "${created?.name ?? addCustomer?.name}" added`);
      if (addCustomer) {
        setCreatedNames((prev) => new Set(prev).add(addCustomer.name.toLowerCase()));
      }
      setAddCustomer(null);
      utils.customerOrg.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to add customer"),
  });

  // Reads a folder's summary sheet to prefill the add-customer form.
  const extractCustomer = trpc.customerRecords.extractCustomerFromFolder.useMutation();

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = useCallback(() => {
    setSubmittedQuery(searchQuery.trim());
    setCurrentFolderId("");
    setBreadcrumbs([]);
  }, [searchQuery]);

  const navigateInto = useCallback((entry: DriveEntry) => {
    if (!entry.isFolder) return;
    setBreadcrumbs((prev) => [...prev, { id: entry.id, name: entry.name }]);
    setCurrentFolderId(entry.id);
    setFileFilter("");
  }, []);

  const navigateTo = useCallback(
    (crumb: { id: string; name: string } | null) => {
      if (!crumb) {
        setCurrentFolderId("");
        setBreadcrumbs([]);
      } else {
        const idx = breadcrumbs.findIndex((c) => c.id === crumb.id);
        setBreadcrumbs((prev) => prev.slice(0, idx + 1));
        setCurrentFolderId(crumb.id);
      }
      setFileFilter("");
    },
    [breadcrumbs]
  );

  const openFolder = useCallback((folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs([{ id: folderId, name: folderName }]);
    setFileFilter("");
    setSubmittedQuery("");
    setSearchQuery("");
  }, []);

  const handleDownload = useCallback(
    (entry: DriveEntry) => {
      setDownloading(entry.id);
      downloadMutation.mutate({ fileId: entry.id });
    },
    [downloadMutation]
  );

  // True when a customer org with this name (case-insensitive) already exists.
  const customerExists = useCallback(
    (name: string) => {
      const n = name.trim().toLowerCase();
      return (existingCustomers ?? []).some((c: any) => c.name.trim().toLowerCase() === n);
    },
    [existingCustomers]
  );

  // Open the "add customer" dialog, prefilling from the folder's summary sheet
  // when one is found; otherwise fall back to just the folder name.
  const addFromFolder = useCallback(
    (folderId: string, folderName: string) => {
      setExtractingFolderId(folderId);
      extractCustomer.mutate(
        { folderId },
        {
          onSuccess: (res) => {
            setExtractingFolderId(null);
            setAddCustomer({
              name: (res.name || folderName).trim(),
              contactName: res.contactName ?? "",
              contactEmail: res.contactEmail ?? "",
              contactPhone: res.contactPhone ?? "",
              address: res.address ?? "",
            });
            if (res.found) {
              toast.success(`Loaded details from "${res.source?.fileName ?? "summary sheet"}"`);
            } else {
              toast.message("No summary sheet found — enter details manually.");
            }
          },
          onError: (err) => {
            setExtractingFolderId(null);
            // Don't block the user — open with the folder name so they can type.
            setAddCustomer({
              name: folderName.trim(),
              contactName: "",
              contactEmail: "",
              contactPhone: "",
              address: "",
            });
            toast.error(err.message || "Couldn't read the summary sheet — enter details manually.");
          },
        }
      );
    },
    [extractCustomer]
  );

  // ── Derived data ──────────────────────────────────────────────────────────

  const displayedEntries: DriveEntry[] = (() => {
    const raw = currentFolderId ? (folderData?.entries ?? []) : [];
    if (!fileFilter) return raw;
    const q = fileFilter.toLowerCase();
    return raw.filter((e) => e.name.toLowerCase().includes(q));
  })();

  // ── Not yet loaded ────────────────────────────────────────────────────────

  if (isStatusLoading) {
    return (
      <AdminLayout title="Customer Records">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  // ── Drive not configured ──────────────────────────────────────────────────

  if (status && !status.configured) {
    return (
      <AdminLayout title="Customer Records">
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
            <WifiOff className="h-12 w-12 text-amber-500" />
            <div>
              <p className="font-semibold text-lg">Google Drive Not Configured</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                {status.error ??
                  "Set GOOGLE_DRIVE_CUSTOMER_ROOT_ID on the server to enable this feature."}
              </p>
              <p className="text-sm text-muted-foreground mt-3 max-w-md">
                Ask your administrator to set{" "}
                <code className="bg-muted px-1 rounded">GOOGLE_DRIVE_CUSTOMER_ROOT_ID</code> to
                the ID of the root customer-records folder in Google Drive.
              </p>
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  // ── Google account not connected ──────────────────────────────────────────

  if (status && status.configured && !status.connected) {
    return (
      <AdminLayout title="Customer Records">
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
            <LogIn className="h-12 w-12 text-blue-500" />
            <div>
              <p className="font-semibold text-lg">Google Account Not Connected</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                Your account is not linked to Google. Log out and log back in using{" "}
                <strong>Sign in with Google</strong> to access customer records.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Go to login
            </Button>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <AdminLayout title="Customer Records">
      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-12rem)]">

        {/* ── LEFT PANEL: Search + results ─────────────────────────────── */}
        <aside className="w-full lg:w-80 shrink-0 space-y-4">

          {/* Search bar */}
          <Card>
            <CardContent className="pt-4 pb-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Customer, building, address, job #..."
                  value={searchQuery}
                  className="pl-9"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={handleSearch}
                disabled={!searchQuery.trim()}
              >
                {isSearching || isRefetching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search
              </Button>
            </CardContent>
          </Card>

          {/* Search results */}
          {submittedQuery && searchResults && (
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-medium">
                  Results for "{submittedQuery}"
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 space-y-3">

                {/* DB: Customers */}
                {searchResults.customers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Customers
                    </p>
                    {searchResults.customers.map((c) => (
                      <div key={c.id} className="p-2 rounded flex items-start gap-2 bg-muted/30">
                        <Building2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          {c.contactName && (
                            <p className="text-xs text-muted-foreground truncate">{c.contactName}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* DB: Sites */}
                {searchResults.sites.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Sites
                    </p>
                    {searchResults.sites.map((s) => (
                      <div key={s.id} className="p-2 rounded flex items-start gap-2 bg-muted/30">
                        <MapPin className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          {s.address && (
                            <p className="text-xs text-muted-foreground truncate">{s.address}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* DB: Jobs */}
                {searchResults.jobs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Jobs
                    </p>
                    {searchResults.jobs.map((j) => (
                      <div key={j.id} className="p-2 rounded flex items-start gap-2 bg-muted/30">
                        <ClipboardList className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{j.jobNumber}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drive: matching folders/files */}
                {searchResults.driveEntries.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Drive Files
                    </p>
                    {searchResults.driveEntries.map((e) => (
                      <button
                        key={e.id}
                        className="w-full text-left p-2 rounded hover:bg-muted flex items-center gap-2"
                        onClick={() =>
                          e.isFolder
                            ? openFolder(e.id, e.name)
                            : e.webViewLink
                            ? window.open(e.webViewLink, "_blank", "noopener,noreferrer")
                            : undefined
                        }
                      >
                        {fileIcon(e)}
                        <span className="text-sm truncate flex-1">{e.name}</span>
                        {!e.isFolder && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.driveError && (
                  <p className="text-xs text-destructive">
                    Drive search error: {searchResults.driveError}
                  </p>
                )}

                {searchResults.customers.length === 0 &&
                  searchResults.sites.length === 0 &&
                  searchResults.jobs.length === 0 &&
                  searchResults.driveEntries.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No results found.
                    </p>
                  )}
              </CardContent>
            </Card>
          )}

          {/* Root folder list (when not searching) */}
          {!submittedQuery && (
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-medium">All Customer Folders</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {isLoadingRoot ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : rootData?.error ? (
                  <p className="text-sm text-destructive">{rootData.error}</p>
                ) : (rootData?.entries?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No folders found in the configured Drive root.
                  </p>
                ) : (
                  <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
                    {rootData!.entries.map((e) => {
                      const exists = e.isFolder && customerExists(e.name);
                      const added = e.isFolder && createdNames.has(e.name.trim().toLowerCase());
                      return (
                        <div
                          key={e.id}
                          className="group flex items-center gap-1 rounded hover:bg-muted"
                        >
                          <button
                            className="flex-1 min-w-0 text-left px-2 py-1.5 text-sm flex items-center gap-2"
                            onClick={() =>
                              e.isFolder
                                ? openFolder(e.id, e.name)
                                : e.webViewLink
                                ? window.open(e.webViewLink, "_blank", "noopener,noreferrer")
                                : undefined
                            }
                          >
                            {fileIcon(e)}
                            <span className="truncate">{e.name}</span>
                          </button>
                          {e.isFolder && (
                            exists || added ? (
                              <span
                                className="shrink-0 mr-1 text-green-600 flex items-center"
                                title="A customer with this name already exists"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 mr-0.5 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Add as customer (reads the folder's summary sheet)"
                                disabled={extractingFolderId === e.id}
                                onClick={() => addFromFolder(e.id, e.name)}
                              >
                                {extractingFolderId === e.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserPlus className="h-4 w-4" />
                                )}
                              </Button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </aside>

        {/* ── RIGHT PANEL: File browser ─────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          <Card className="h-full">
            {/* Browser toolbar */}
            <CardHeader className="pb-3 pt-4 border-b space-y-2">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 flex-wrap text-sm min-h-[1.5rem]">
                <button
                  className="text-primary hover:underline font-medium"
                  onClick={() => navigateTo(null)}
                >
                  Drive Root
                </button>
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    {i === breadcrumbs.length - 1 ? (
                      <span className="font-medium truncate max-w-[200px]">{crumb.name}</span>
                    ) : (
                      <button
                        className="text-primary hover:underline truncate max-w-[200px]"
                        onClick={() => navigateTo(crumb)}
                      >
                        {crumb.name}
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2">
                {breadcrumbs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigateTo(
                        breadcrumbs.length > 1
                          ? breadcrumbs[breadcrumbs.length - 2]
                          : null
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                )}
                {currentFolderId && (
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter files..."
                      value={fileFilter}
                      className="pl-8 h-8 text-sm"
                      onChange={(e) => setFileFilter(e.target.value)}
                    />
                  </div>
                )}
                {currentFolderId && breadcrumbs.length > 0 && (() => {
                  const folderName = breadcrumbs[breadcrumbs.length - 1].name;
                  const already =
                    customerExists(folderName) || createdNames.has(folderName.trim().toLowerCase());
                  const extracting = extractingFolderId === currentFolderId;
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto shrink-0"
                      disabled={already || extracting}
                      title={
                        already
                          ? "A customer with this name already exists"
                          : "Create a customer from this folder's summary sheet"
                      }
                      onClick={() => addFromFolder(currentFolderId, folderName)}
                    >
                      {already ? (
                        <><CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />Customer exists</>
                      ) : extracting ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Reading…</>
                      ) : (
                        <><UserPlus className="h-4 w-4 mr-1" />Add as customer</>
                      )}
                    </Button>
                  );
                })()}
              </div>
            </CardHeader>

            <CardContent className="p-0">

              {/* No folder selected */}
              {!currentFolderId && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                  <FolderOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
                  <p className="font-medium text-lg text-muted-foreground">No folder selected</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Search for a customer or select a folder from the list on the left.
                  </p>
                </div>
              )}

              {/* Loading */}
              {currentFolderId && isLoadingFolder && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* tRPC error */}
              {currentFolderId && folderError && (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
                  <p className="font-medium">Could not load folder</p>
                  <p className="text-sm text-muted-foreground mt-1">{folderError.message}</p>
                </div>
              )}

              {/* Drive-level error (permissions, etc.) */}
              {currentFolderId && folderData?.error && (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
                  <p className="font-medium">Google Drive error</p>
                  <p className="text-sm text-muted-foreground mt-1">{folderData.error}</p>
                </div>
              )}

              {/* Empty folder */}
              {currentFolderId &&
                !isLoadingFolder &&
                !folderError &&
                !folderData?.error &&
                displayedEntries.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Folder className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">
                      {fileFilter ? "No files match your filter." : "This folder is empty."}
                    </p>
                  </div>
                )}

              {/* File list */}
              {currentFolderId && displayedEntries.length > 0 && (
                <div className="divide-y">
                  {displayedEntries.map((entry) => {
                    const ext = mimeToExt(entry.mimeType);
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 group"
                      >
                        {/* Icon */}
                        <span className="shrink-0">{fileIcon(entry)}</span>

                        {/* Name + metadata */}
                        <div className="flex-1 min-w-0">
                          {entry.isFolder ? (
                            <button
                              className="text-sm font-medium hover:text-primary truncate block text-left w-full"
                              onClick={() => navigateInto(entry)}
                            >
                              {entry.name}
                            </button>
                          ) : (
                            <span className="text-sm truncate block">{entry.name}</span>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {ext && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1 h-4">
                                {ext}
                              </Badge>
                            )}
                            {entry.size && (
                              <span className="text-xs text-muted-foreground">
                                {formatBytes(entry.size)}
                              </span>
                            )}
                            {entry.modifiedTime && (
                              <span className="text-xs text-muted-foreground">
                                {formatDate(entry.modifiedTime)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          {entry.isFolder ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => navigateInto(entry)}
                            >
                              <FolderOpen className="h-3.5 w-3.5 mr-1" />
                              Open
                            </Button>
                          ) : (
                            <>
                              {entry.webViewLink && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  asChild
                                >
                                  <a
                                    href={entry.webViewLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                    View
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                disabled={downloading === entry.id}
                                onClick={() => handleDownload(entry)}
                              >
                                {downloading === entry.id ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                )}
                                Download
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Add-customer dialog — prefilled from a Drive folder name */}
      <Dialog open={!!addCustomer} onOpenChange={(open) => { if (!open) setAddCustomer(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add Customer from Records
            </DialogTitle>
            <DialogDescription>
              Details are pulled from the folder's summary sheet when one is found.
              Review them, fill any gaps, then create the customer.
            </DialogDescription>
          </DialogHeader>

          {addCustomer && (() => {
            const nameTrimmed = addCustomer.name.trim();
            const duplicate = customerExists(nameTrimmed);
            return (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Company Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={addCustomer.name}
                    onChange={(e) => setAddCustomer({ ...addCustomer, name: e.target.value })}
                    placeholder="Customer company name"
                  />
                  {duplicate && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      A customer named "{nameTrimmed}" already exists.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Name</Label>
                  <Input
                    value={addCustomer.contactName}
                    onChange={(e) => setAddCustomer({ ...addCustomer, contactName: e.target.value })}
                    placeholder="Primary contact name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Contact Email</Label>
                    <Input
                      type="email"
                      value={addCustomer.contactEmail}
                      onChange={(e) => setAddCustomer({ ...addCustomer, contactEmail: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contact Phone</Label>
                    <Input
                      value={addCustomer.contactPhone}
                      onChange={(e) => setAddCustomer({ ...addCustomer, contactPhone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input
                    value={addCustomer.address}
                    onChange={(e) => setAddCustomer({ ...addCustomer, address: e.target.value })}
                    placeholder="Business address"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setAddCustomer(null)} disabled={createCustomer.isPending}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!nameTrimmed || duplicate || createCustomer.isPending}
                    onClick={() =>
                      createCustomer.mutate({
                        companyId: user.companyId!,
                        name: nameTrimmed,
                        contactName: addCustomer.contactName.trim() || undefined,
                        contactEmail: addCustomer.contactEmail.trim() || undefined,
                        contactPhone: addCustomer.contactPhone.trim() || undefined,
                        address: addCustomer.address.trim() || undefined,
                      })
                    }
                  >
                    {createCustomer.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding…</>
                    ) : (
                      <><UserPlus className="h-4 w-4 mr-2" />Add Customer</>
                    )}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
