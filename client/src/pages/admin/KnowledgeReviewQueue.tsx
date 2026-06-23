import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const SOURCE_LABELS: Record<string, string> = {
  manufacturer_doc: "Manufacturer doc",
  code_requirement: "Code requirement",
  company_procedure: "Company procedure",
  technician_observation: "Technician observation",
  ai_inference: "AI inference",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  reviewed: "bg-blue-100 text-blue-800",
  verified: "bg-green-100 text-green-800",
};

interface QueueItem {
  id: number;
  pageId: number;
  pageTitle: string;
  subjectType: string | null;
  siteId: number | null;
  equipmentModelId: number | null;
  content: string;
  status: string;
  sourceType: string;
  generatedByAi: boolean;
  createdAt: string | Date;
}

function pageHref(item: QueueItem): string {
  if (item.subjectType === "equipment_model" && item.equipmentModelId) {
    return `/admin/equipment-knowledge/${item.equipmentModelId}`;
  }
  if (item.siteId) return `/admin/sites/${item.siteId}/knowledge`;
  return "#";
}

function QueueCard({ item, badge }: { item: QueueItem; badge: React.ReactNode }) {
  return (
    <Link href={pageHref(item)}>
      <Card className="cursor-pointer transition-colors hover:bg-muted/50">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">{item.content}</p>
            {badge}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{item.pageTitle}</span>
            <span>·</span>
            <span>{SOURCE_LABELS[item.sourceType] ?? item.sourceType}</span>
            {item.generatedByAi && <Badge variant="outline">AI</Badge>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function KnowledgeReviewQueue() {
  const { user } = useAuth();
  const { data, isLoading } = trpc.knowledgeFact.reviewQueue.useQuery(undefined, {
    enabled: !!user?.companyId,
  });

  if (!user || !user.companyId) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  const awaitingReview = (data?.awaitingReview ?? []) as QueueItem[];
  const potentiallyOutdated = (data?.potentiallyOutdated ?? []) as QueueItem[];

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge Review</h1>
          <p className="text-muted-foreground">
            Everything across all properties and equipment that needs a reviewer's attention.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Awaiting review ({awaitingReview.length})</CardTitle>
            <CardDescription>Draft or reviewed facts with no verify/reject decision yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && awaitingReview.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing awaiting review.</p>
            )}
            {awaitingReview.map((item) => (
              <QueueCard key={item.id} item={item} badge={<Badge className={STATUS_STYLES[item.status]}>{item.status}</Badge>} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>May be outdated ({potentiallyOutdated.length})</CardTitle>
            <CardDescription>Verified facts a newer report or completed service visit may have superseded.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && potentiallyOutdated.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing flagged.</p>
            )}
            {potentiallyOutdated.map((item) => (
              <QueueCard key={item.id} item={item} badge={<Badge className="bg-orange-100 text-orange-800">May be outdated</Badge>} />
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
