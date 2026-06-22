import { useState } from "react";
import { useParams, Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import KnowledgePanel from "@/components/knowledge/KnowledgePanel";
import { trpc } from "@/lib/trpc";

// Mirrors the SYSTEM_OPTIONS list used elsewhere (e.g. RepairQuoteDetail) so
// system knowledge pages line up with the categories the rest of the app
// already inspects/repairs against.
const SYSTEM_OPTIONS = [
  { value: "FIRE_ALARM", label: "Fire Alarm" },
  { value: "SMOKE_ALARM", label: "Smoke Alarm" },
  { value: "FIRE_EXTINGUISHER", label: "Fire Extinguisher" },
  { value: "EMERGENCY_LIGHTING", label: "Emergency Lighting" },
  { value: "SPRINKLER", label: "Sprinkler" },
  { value: "BACKFLOW", label: "Backflow" },
  { value: "OTHER", label: "Other" },
] as const;

export default function SiteKnowledge() {
  const { user } = useAuth();
  const params = useParams<{ siteId: string }>();
  const siteId = parseInt(params.siteId || "0");
  const [activeTab, setActiveTab] = useState("property");

  if (!user || !user.companyId) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  const { data: site } = trpc.site.get.useQuery({ id: siteId }, { enabled: siteId > 0 });
  const { data: pages, refetch: refetchPages } = trpc.knowledgePage.listBySite.useQuery(
    { siteId },
    { enabled: siteId > 0 },
  );
  const sitePage = pages?.find((p) => p.subjectType === "site");
  const pageId = sitePage?.id;
  const systemPages = (pages ?? []).filter((p) => p.subjectType === "site_system");
  const availableSystemOptions = SYSTEM_OPTIONS.filter(
    (o) => !systemPages.some((p) => p.systemType === o.value),
  );

  const getOrCreate = trpc.knowledgePage.getOrCreateForSite.useMutation({
    onSuccess: () => refetchPages(),
    onError: (e) => toast.error(e.message),
  });

  const getOrCreateSystem = trpc.knowledgePage.getOrCreateForSiteSystem.useMutation({
    onSuccess: async (page) => {
      await refetchPages();
      setActiveTab(page.systemType ?? "property");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <Link href={`/admin/sites`} className="text-sm text-muted-foreground hover:underline">← Sites</Link>
          <h1 className="text-2xl font-semibold mt-1">Property Knowledge</h1>
          <p className="text-muted-foreground">{site?.name ?? `Site #${siteId}`}</p>
        </div>

        {!pageId && (
          <Card>
            <CardHeader>
              <CardTitle>No knowledge page yet</CardTitle>
              <CardDescription>
                Create a property knowledge page to start ingesting reports and manuals for this site.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                disabled={getOrCreate.isPending}
                onClick={() => getOrCreate.mutate({ siteId })}
              >
                Create knowledge page
              </Button>
            </CardContent>
          </Card>
        )}

        {pageId && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <TabsList>
                <TabsTrigger value="property">Property</TabsTrigger>
                {systemPages.map((p) => (
                  <TabsTrigger key={p.id} value={p.systemType!}>
                    {SYSTEM_OPTIONS.find((o) => o.value === p.systemType)?.label ?? p.systemType}
                  </TabsTrigger>
                ))}
              </TabsList>
              {availableSystemOptions.length > 0 && (
                <Select
                  value=""
                  onValueChange={(v) => getOrCreateSystem.mutate({ siteId, systemType: v as typeof availableSystemOptions[number]["value"] })}
                >
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="+ Add system knowledge" /></SelectTrigger>
                  <SelectContent>
                    {availableSystemOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <TabsContent value="property" className="space-y-6 mt-4">
              <KnowledgePanel
                pageId={pageId}
                siteId={siteId}
                defaultDocumentType="inspection_report"
                questionPlaceholder="e.g. What fire alarm panel is installed here?"
              />
            </TabsContent>
            {systemPages.map((p) => (
              <TabsContent key={p.id} value={p.systemType!} className="space-y-6 mt-4">
                <KnowledgePanel
                  pageId={p.id}
                  siteId={siteId}
                  defaultDocumentType="inspection_report"
                  questionPlaceholder={`e.g. What is the ${SYSTEM_OPTIONS.find((o) => o.value === p.systemType)?.label ?? p.systemType} test frequency here?`}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}
