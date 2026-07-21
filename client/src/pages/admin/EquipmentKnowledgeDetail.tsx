import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import KnowledgePanel from "@/components/knowledge/KnowledgePanel";
import { trpc } from "@/lib/trpc";

type EquipmentKnowledgeDetailProps = {
  modelId: number;
};

export default function EquipmentKnowledgeDetail({ modelId }: EquipmentKnowledgeDetailProps) {
  const { user } = useAuth();
  const equipmentModelId = modelId;

  if (!user || !user.companyId) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  const { data: model } = trpc.knowledgeEquipment.getModel.useQuery(
    { equipmentModelId },
    { enabled: equipmentModelId > 0 },
  );
  const { data: pages, refetch: refetchPages } = trpc.knowledgeEquipment.listPages.useQuery(
    { equipmentModelId },
    { enabled: equipmentModelId > 0 },
  );
  const modelPage = pages?.find((p) => p.subjectType === "equipment_model");
  const pageId = modelPage?.id;

  const getOrCreate = trpc.knowledgeEquipment.getOrCreateForModel.useMutation({
    onSuccess: () => refetchPages(),
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <Link href="/admin/equipment-knowledge" className="text-sm text-muted-foreground hover:underline">← Equipment Knowledge</Link>
          <h1 className="text-2xl font-semibold mt-1">
            {model ? `${model.manufacturer} ${model.model}` : `Equipment #${equipmentModelId}`}
          </h1>
          {model?.deviceType && <p className="text-muted-foreground">{model.deviceType}</p>}
        </div>

        {!pageId && (
          <Card>
            <CardHeader>
              <CardTitle>No knowledge page yet</CardTitle>
              <CardDescription>
                Create a knowledge page to start ingesting manuals and documentation for this equipment model.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                disabled={getOrCreate.isPending}
                onClick={() => getOrCreate.mutate({ equipmentModelId })}
              >
                Create knowledge page
              </Button>
            </CardContent>
          </Card>
        )}

        {pageId && (
          <KnowledgePanel
            pageId={pageId}
            defaultDocumentType="equipment_manual"
            questionPlaceholder="e.g. What is the battery specification for this panel?"
          />
        )}
      </div>
    </AdminLayout>
  );
}
