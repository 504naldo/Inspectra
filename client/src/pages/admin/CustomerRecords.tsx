import { useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  ChevronRight,
  ChevronLeft,
  Building2,
  MapPin,
  ClipboardList,
  AlertTriangle,
  WifiOff,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  type: "file" | "directory";
  relativePath: string;
  size?: number;
  modifiedAt?: string;
  extension?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA");
}

function fileIcon(entry: FileEntry) {
  if (entry.type === "directory") return <Folder className="h-4 w-4 text-amber-500" />;
  const ext = entry.extension ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
    return <FileImage className="h-4 w-4 text-blue-500" />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (["doc", "docx", "pdf", "txt"].includes(ext))
    return <FileText className="h-4 w-4 text-primary" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomerRecords() {
  const { user } = useAuth();

  // Search panel state
  const [searchQuery, setSearchQuery]     = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  // Folder browser state
  const [currentPath, setCurrentPath]     = useState(""); // relative to share root
  const [breadcrumbs, setBreadcrumbs]     = useState<{ name: string; path: string }[]>([]);
  const [fileFilter, setFileFilter]       = useState("");

  // Download in-progress tracking
  const [downloading, setDownloading]     = useState<string | null>(null);

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

  const { data: status } = trpc.customerRecords.status.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });

  const {
    data: searchResults,
    isLoading: isSearching,
    isFetching: isRefetching,
  } = trpc.customerRecords.search.useQuery(
    { companyId: user.companyId, query: submittedQuery },
    { enabled: submittedQuery.length >= 1, retry: false }
  );

  const {
    data: rootFolders,
    isLoading: isLoadingRoot,
  } = trpc.customerRecords.listRoot.useQuery(undefined, {
    enabled: !submittedQuery && status?.reachable === true,
    retry: false,
  });

  const {
    data: folderContents,
    isLoading: isLoadingFolder,
    error: folderError,
  } = trpc.customerRecords.listFolder.useQuery(
    { folderPath: currentPath },
    { enabled: currentPath !== "" && status?.reachable === true, retry: false }
  );

  const downloadMutation = trpc.customerRecords.downloadFile.useMutation({
    onSuccess(result) {
      // Convert base64 → Blob → trigger browser download
      const bytes  = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
      const blob   = new Blob([bytes], { type: result.mimeType });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement("a");
      a.href       = url;
      a.download   = result.fileName;
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

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = useCallback(() => {
    setSubmittedQuery(searchQuery.trim());
    // Reset browser to root when a new search is performed
    setCurrentPath("");
    setBreadcrumbs([]);
  }, [searchQuery]);

  const navigateInto = useCallback((entry: FileEntry) => {
    if (entry.type !== "directory") return;
    setBreadcrumbs(prev => [...prev, { name: entry.name, path: entry.relativePath }]);
    setCurrentPath(entry.relativePath);
    setFileFilter("");
  }, []);

  const navigateTo = useCallback((crumb: { name: string; path: string } | null) => {
    if (!crumb) {
      setCurrentPath("");
      setBreadcrumbs([]);
    } else {
      const idx = breadcrumbs.findIndex(c => c.path === crumb.path);
      setBreadcrumbs(prev => prev.slice(0, idx + 1));
      setCurrentPath(crumb.path);
    }
    setFileFilter("");
  }, [breadcrumbs]);

  const openFolder = useCallback((folderName: string) => {
    setCurrentPath(folderName);
    setBreadcrumbs([{ name: folderName, path: folderName }]);
    setFileFilter("");
    setSubmittedQuery("");
    setSearchQuery("");
  }, []);

  const handleDownload = useCallback((entry: FileEntry) => {
    setDownloading(entry.relativePath);
    downloadMutation.mutate({ filePath: entry.relativePath });
  }, [downloadMutation]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const displayedEntries: FileEntry[] = (() => {
    const raw = currentPath
      ? (folderContents?.entries ?? [])
      : [];
    if (!fileFilter) return raw;
    const q = fileFilter.toLowerCase();
    return raw.filter(e => e.name.toLowerCase().includes(q));
  })();

  // ── Share unavailable banner ──────────────────────────────────────────────

  if (status && !status.reachable) {
    return (
      <AdminLayout title="Customer Records">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
            <WifiOff className="h-12 w-12 text-destructive" />
            <div>
              <p className="font-semibold text-lg">Network Share Unavailable</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                {status.error ?? "The customer records share cannot be reached from this server."}
              </p>
              {!status.configured && (
                <p className="text-sm text-muted-foreground mt-3">
                  Set the <code className="bg-muted px-1 rounded">CUSTOMER_SHARE_ROOT</code> environment
                  variable and mount the network share to enable this feature.
                </p>
              )}
            </div>
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
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={handleSearch}
                disabled={!searchQuery.trim()}
              >
                {(isSearching || isRefetching) ? (
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
                <CardTitle className="text-sm font-medium">Results for "{submittedQuery}"</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 space-y-3">

                {searchResults.customers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Customers</p>
                    {searchResults.customers.map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left p-2 rounded hover:bg-muted flex items-start gap-2"
                        onClick={() => openFolder(c.name)}
                      >
                        <Building2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          {c.contactName && (
                            <p className="text-xs text-muted-foreground truncate">{c.contactName}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.sites.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sites</p>
                    {searchResults.sites.map(s => (
                      <button
                        key={s.id}
                        className="w-full text-left p-2 rounded hover:bg-muted flex items-start gap-2"
                        onClick={() => openFolder(s.name)}
                      >
                        <MapPin className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          {s.address && (
                            <p className="text-xs text-muted-foreground truncate">{s.address}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.jobs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Jobs</p>
                    {searchResults.jobs.map(j => (
                      <button
                        key={j.id}
                        className="w-full text-left p-2 rounded hover:bg-muted flex items-start gap-2"
                        onClick={() => openFolder(j.jobNumber)}
                      >
                        <ClipboardList className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{j.jobNumber}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.shareFolders.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Share Folders</p>
                    {searchResults.shareFolders.map(f => (
                      <button
                        key={f}
                        className="w-full text-left p-2 rounded hover:bg-muted flex items-center gap-2"
                        onClick={() => openFolder(f)}
                      >
                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="text-sm truncate">{f}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.customers.length === 0 &&
                  searchResults.sites.length === 0 &&
                  searchResults.jobs.length === 0 &&
                  searchResults.shareFolders.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No results found.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Root folder shortcuts (shown when not searching) */}
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
                ) : rootFolders?.error ? (
                  <p className="text-sm text-destructive">{rootFolders.error}</p>
                ) : (rootFolders?.folders?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No folders found at share root.
                  </p>
                ) : (
                  <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
                    {rootFolders!.folders.map(f => (
                      <button
                        key={f}
                        className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => openFolder(f)}
                      >
                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="truncate">{f}</span>
                      </button>
                    ))}
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
                  Share Root
                </button>
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.path} className="flex items-center gap-1">
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

              {/* Actions */}
              <div className="flex items-center gap-2">
                {breadcrumbs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateTo(breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                )}
                {currentPath && (
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter files..."
                      value={fileFilter}
                      className="pl-8 h-8 text-sm"
                      onChange={e => setFileFilter(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">

              {/* No folder selected */}
              {!currentPath && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                  <FolderOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
                  <p className="font-medium text-lg text-muted-foreground">No folder selected</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Search for a customer or select a folder from the list on the left.
                  </p>
                </div>
              )}

              {/* Loading */}
              {currentPath && isLoadingFolder && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Error */}
              {currentPath && folderError && (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
                  <p className="font-medium">Could not load folder</p>
                  <p className="text-sm text-muted-foreground mt-1">{folderError.message}</p>
                </div>
              )}

              {/* Share-level error (directory missing, etc.) */}
              {currentPath && folderContents?.error && (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
                  <p className="font-medium">Share access problem</p>
                  <p className="text-sm text-muted-foreground mt-1">{folderContents.error}</p>
                </div>
              )}

              {/* Empty folder */}
              {currentPath && !isLoadingFolder && !folderError && !folderContents?.error &&
                displayedEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Folder className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">
                    {fileFilter ? "No files match your filter." : "This folder is empty."}
                  </p>
                </div>
              )}

              {/* File list */}
              {currentPath && displayedEntries.length > 0 && (
                <div className="divide-y">
                  {displayedEntries.map(entry => (
                    <div
                      key={entry.relativePath}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 group"
                    >
                      {/* Icon */}
                      <span className="shrink-0">{fileIcon(entry)}</span>

                      {/* Name + metadata */}
                      <div className="flex-1 min-w-0">
                        {entry.type === "directory" ? (
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
                          {entry.extension && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 h-4">
                              {entry.extension.toUpperCase()}
                            </Badge>
                          )}
                          {entry.size != null && (
                            <span className="text-xs text-muted-foreground">{formatBytes(entry.size)}</span>
                          )}
                          {entry.modifiedAt && (
                            <span className="text-xs text-muted-foreground">{formatDate(entry.modifiedAt)}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        {entry.type === "directory" ? (
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            disabled={downloading === entry.relativePath}
                            onClick={() => handleDownload(entry)}
                          >
                            {downloading === entry.relativePath ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5 mr-1" />
                            )}
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </AdminLayout>
  );
}
