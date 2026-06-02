import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  FileImage,
  File,
  Search,
  ExternalLink,
  ClipboardList,
  BookOpen,
  Image,
  Receipt,
  FolderOpen,
  Download,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useDeferredValue } from "react";

const DOC_TYPES = [
  { value: "all",             label: "All Documents" },
  { value: "report",          label: "Reports"        },
  { value: "attachment",      label: "Attachments"    },
  { value: "quote",           label: "Quotes"         },
  { value: "knowledge_base",  label: "Knowledge Base" },
] as const;

type DocTypeValue = (typeof DOC_TYPES)[number]["value"];

function fileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-5 w-5 text-muted-foreground" />;
  if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mimeType.includes("pdf")) return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function docTypeIcon(docType: string) {
  switch (docType) {
    case "report":         return <ClipboardList className="h-4 w-4" />;
    case "attachment":     return <Image className="h-4 w-4" />;
    case "quote":          return <Receipt className="h-4 w-4" />;
    case "knowledge_base": return <BookOpen className="h-4 w-4" />;
    default:               return <FolderOpen className="h-4 w-4" />;
  }
}

function docTypeBadgeVariant(docType: string): "default" | "secondary" | "outline" | "destructive" {
  switch (docType) {
    case "report":         return "default";
    case "attachment":     return "secondary";
    case "quote":          return "outline";
    case "knowledge_base": return "destructive";
    default:               return "secondary";
  }
}

function docTypeLabel(docType: string) {
  switch (docType) {
    case "report":         return "Report";
    case "attachment":     return "Attachment";
    case "quote":          return "Quote";
    case "knowledge_base": return "KB";
    default:               return docType;
  }
}

function formatBytes(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DocumentCenter() {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<DocTypeValue>("all");
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading } = trpc.documentCenter.list.useQuery(
    { search: deferredSearch, docType, limit: 300 },
    {},
  );

  const items = data?.items ?? [];
  const counts = data?.counts ?? { all: 0, report: 0, attachment: 0, quote: 0, knowledge_base: 0 };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Document Center</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All files across reports, attachments, quotes, and knowledge base
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DOC_TYPES.filter((t) => t.value !== "all").map((t) => (
            <button
              key={t.value}
              onClick={() => setDocType(t.value)}
              className={`text-left rounded-lg border p-4 transition-colors hover:bg-muted/60 ${docType === t.value ? "border-primary bg-primary/5" : "bg-card"}`}
            >
              <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                {docTypeIcon(t.value)}
                <span className="text-xs font-medium">{t.label}</span>
              </div>
              <div className="text-2xl font-bold">
                {counts[t.value as keyof typeof counts] ?? 0}
              </div>
            </button>
          ))}
        </div>

        {/* Search + type filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, report number, quote number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {DOC_TYPES.map((t) => (
              <Button
                key={t.value}
                size="sm"
                variant={docType === t.value ? "default" : "outline"}
                onClick={() => setDocType(t.value)}
              >
                {t.label}
                {t.value !== "all" && (
                  <span className="ml-1.5 opacity-60 text-xs">
                    {counts[t.value as keyof typeof counts] ?? 0}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Document list */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading documents…</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {search ? "No documents match your search" : "No documents found"}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    {/* File type icon */}
                    <div className="mt-0.5 shrink-0">{fileIcon(item.mimeType)}</div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{item.title}</span>
                        <Badge variant={docTypeBadgeVariant(item.docType)} className="shrink-0 text-xs gap-1">
                          {docTypeIcon(item.docType)}
                          {docTypeLabel(item.docType)}
                        </Badge>
                        {item.status && (
                          <Badge variant="outline" className="text-xs">{item.status}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {item.siteName && <span>{item.siteName}</span>}
                        {item.customerName && <span>· {item.customerName}</span>}
                        {item.jobNumber && (
                          <Link href={`/admin/jobs/${item.jobId}`}>
                            <span className="text-primary hover:underline">Job {item.jobNumber}</span>
                          </Link>
                        )}
                        {item.entityType && !item.jobNumber && (
                          <span className="capitalize">{item.entityType.replace(/_/g, " ")}</span>
                        )}
                        {item.fileSize && <span>{formatBytes(item.fileSize)}</span>}
                        <span>{formatDate(item.date)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Link href={item.href}>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="View record">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                      {item.fileUrl && (
                        <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Open file">
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing {items.length} of {counts.all} document{counts.all !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
