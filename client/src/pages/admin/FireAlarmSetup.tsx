import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";

export default function FireAlarmSetup() {
  const { siteId } = useParams();
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    manufacturer: "",
    modelNumber: "",
    operationType: "single_stage" as "single_stage" | "two_stage" | "other",
    operationDescription: "",
    connectedToMonitoring: false,
    monitoringCentreName: "",
    monitoringCentrePhone: "",
  });

  // Fetch site details
  const { data: site, isLoading: loadingSite } = trpc.site.get.useQuery(
    { id: parseInt(siteId!) },
    { enabled: !!siteId }
  );

  // Fetch existing fire alarm system
  const { data: existingSystem, isLoading: loadingSystem } = trpc.fireAlarm.getSystemBySite.useQuery(
    { siteId: parseInt(siteId!) },
    { enabled: !!siteId }
  );

  // Upsert mutation
  const upsertSystem = trpc.fireAlarm.upsertSystem.useMutation({
    onSuccess: () => {
      toast.success("Fire alarm system saved successfully");
      setLocation(`/admin/sites`);
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Load existing system data into form
  useEffect(() => {
    if (existingSystem) {
      setFormData({
        manufacturer: existingSystem.manufacturer || "",
        modelNumber: existingSystem.modelNumber || "",
        operationType: existingSystem.operationType || "single_stage",
        operationDescription: existingSystem.operationDescription || "",
        connectedToMonitoring: existingSystem.connectedToMonitoring || false,
        monitoringCentreName: existingSystem.monitoringCentreName || "",
        monitoringCentrePhone: existingSystem.monitoringCentrePhone || "",
      });
    }
  }, [existingSystem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await upsertSystem.mutateAsync({
      siteId: parseInt(siteId!),
      ...formData,
    });
  };

  if (loadingSite || loadingSystem) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!site) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Site not found</p>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/sites")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Fire Alarm System Setup</h1>
            <p className="text-muted-foreground">{site.name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {/* System Information */}
          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
              <CardDescription>Basic fire alarm system details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  placeholder="e.g., Simplex, Notifier, Edwards"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelNumber">Model Number</Label>
                <Input
                  id="modelNumber"
                  placeholder="e.g., 4100ES, NFS-320"
                  value={formData.modelNumber}
                  onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="operationType">Operation Type</Label>
                <Select
                  value={formData.operationType}
                  onValueChange={(value: "single_stage" | "two_stage" | "other") =>
                    setFormData({ ...formData, operationType: value })
                  }
                >
                  <SelectTrigger id="operationType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_stage">Single Stage</SelectItem>
                    <SelectItem value="two_stage">Two Stage</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.operationType === "other" && (
                <div className="space-y-2">
                  <Label htmlFor="operationDescription">Operation Description</Label>
                  <Textarea
                    id="operationDescription"
                    placeholder="Describe the operation type..."
                    value={formData.operationDescription}
                    onChange={(e) => setFormData({ ...formData, operationDescription: e.target.value })}
                    rows={3}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monitoring Centre */}
          <Card>
            <CardHeader>
              <CardTitle>Monitoring Centre</CardTitle>
              <CardDescription>Fire signal receiving centre information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="connectedToMonitoring">Connected to Monitoring Centre</Label>
                  <p className="text-sm text-muted-foreground">
                    Is this system connected to a fire signal receiving centre?
                  </p>
                </div>
                <Switch
                  id="connectedToMonitoring"
                  checked={formData.connectedToMonitoring}
                  onCheckedChange={(checked) => setFormData({ ...formData, connectedToMonitoring: checked })}
                />
              </div>

              {formData.connectedToMonitoring && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="monitoringCentreName">Monitoring Centre Name</Label>
                    <Input
                      id="monitoringCentreName"
                      placeholder="e.g., ADT, Chubb"
                      value={formData.monitoringCentreName}
                      onChange={(e) => setFormData({ ...formData, monitoringCentreName: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monitoringCentrePhone">Monitoring Centre Phone</Label>
                    <Input
                      id="monitoringCentrePhone"
                      placeholder="e.g., 1-800-555-0123"
                      value={formData.monitoringCentrePhone}
                      onChange={(e) => setFormData({ ...formData, monitoringCentrePhone: e.target.value })}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setLocation("/admin/sites")}>
              Cancel
            </Button>
            <Button type="submit" disabled={upsertSystem.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {upsertSystem.isPending ? "Saving..." : "Save System"}
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
