import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Phone,
  Mail,
  User,
  Key,
  Car,
  DoorOpen,
  Flame,
  Radio,
  Droplets,
  Zap,
  StickyNote,
  Building2,
  Loader2,
  Save,
} from "lucide-react";

interface WorkSiteInfoProps {
  siteId: number;
}

type InfoForm = {
  siteContactName: string;
  siteContactPhone: string;
  siteContactEmail: string;
  propertyManagerName: string;
  propertyManagerPhone: string;
  propertyManagerEmail: string;
  accessNotes: string;
  keyLocation: string;
  keyNumber: string;
  lockboxCode: string;
  parkingNotes: string;
  serviceEntranceNotes: string;
  fireAlarmPanelMake: string;
  fireAlarmPanelModel: string;
  fireAlarmPanelLocation: string;
  annunciatorLocation: string;
  monitoringCompany: string;
  monitoringPhone: string;
  monitoringAccount: string;
  sprinklerNotes: string;
  backflowNotes: string;
  emergencyLightingNotes: string;
  fireExtinguisherNotes: string;
  generalNotes: string;
};

const EMPTY_FORM: InfoForm = {
  siteContactName: "",
  siteContactPhone: "",
  siteContactEmail: "",
  propertyManagerName: "",
  propertyManagerPhone: "",
  propertyManagerEmail: "",
  accessNotes: "",
  keyLocation: "",
  keyNumber: "",
  lockboxCode: "",
  parkingNotes: "",
  serviceEntranceNotes: "",
  fireAlarmPanelMake: "",
  fireAlarmPanelModel: "",
  fireAlarmPanelLocation: "",
  annunciatorLocation: "",
  monitoringCompany: "",
  monitoringPhone: "",
  monitoringAccount: "",
  sprinklerNotes: "",
  backflowNotes: "",
  emergencyLightingNotes: "",
  fireExtinguisherNotes: "",
  generalNotes: "",
};

function field(
  form: InfoForm,
  setForm: React.Dispatch<React.SetStateAction<InfoForm>>,
  key: keyof InfoForm
) {
  return {
    value: form[key],
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [key]: e.target.value })),
  };
}

export default function WorkSiteInfo({ siteId }: WorkSiteInfoProps) {
  const [form, setForm] = useState<InfoForm>(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);

  const { data: site, isLoading: siteLoading } = trpc.site.get.useQuery({ id: siteId });
  const { data: info, isLoading: infoLoading } = trpc.workSiteInfo.getBySiteId.useQuery({ siteId });

  useEffect(() => {
    if (info) {
      setForm({
        siteContactName: info.siteContactName ?? "",
        siteContactPhone: info.siteContactPhone ?? "",
        siteContactEmail: info.siteContactEmail ?? "",
        propertyManagerName: info.propertyManagerName ?? "",
        propertyManagerPhone: info.propertyManagerPhone ?? "",
        propertyManagerEmail: info.propertyManagerEmail ?? "",
        accessNotes: info.accessNotes ?? "",
        keyLocation: info.keyLocation ?? "",
        keyNumber: info.keyNumber ?? "",
        lockboxCode: info.lockboxCode ?? "",
        parkingNotes: info.parkingNotes ?? "",
        serviceEntranceNotes: info.serviceEntranceNotes ?? "",
        fireAlarmPanelMake: info.fireAlarmPanelMake ?? "",
        fireAlarmPanelModel: info.fireAlarmPanelModel ?? "",
        fireAlarmPanelLocation: info.fireAlarmPanelLocation ?? "",
        annunciatorLocation: info.annunciatorLocation ?? "",
        monitoringCompany: info.monitoringCompany ?? "",
        monitoringPhone: info.monitoringPhone ?? "",
        monitoringAccount: info.monitoringAccount ?? "",
        sprinklerNotes: info.sprinklerNotes ?? "",
        backflowNotes: info.backflowNotes ?? "",
        emergencyLightingNotes: info.emergencyLightingNotes ?? "",
        fireExtinguisherNotes: info.fireExtinguisherNotes ?? "",
        generalNotes: info.generalNotes ?? "",
      });
      setDirty(false);
    }
  }, [info]);

  const saveMutation = trpc.workSiteInfo.createOrUpdate.useMutation({
    onSuccess: () => {
      toast.success("Work Site Info saved");
      setDirty(false);
    },
    onError: (e) => toast.error(e.message || "Failed to save"),
  });

  const handleSave = () => {
    saveMutation.mutate({
      siteId,
      siteContactName: form.siteContactName || undefined,
      siteContactPhone: form.siteContactPhone || undefined,
      siteContactEmail: form.siteContactEmail || undefined,
      propertyManagerName: form.propertyManagerName || undefined,
      propertyManagerPhone: form.propertyManagerPhone || undefined,
      propertyManagerEmail: form.propertyManagerEmail || undefined,
      accessNotes: form.accessNotes || undefined,
      keyLocation: form.keyLocation || undefined,
      keyNumber: form.keyNumber || undefined,
      lockboxCode: form.lockboxCode || undefined,
      parkingNotes: form.parkingNotes || undefined,
      serviceEntranceNotes: form.serviceEntranceNotes || undefined,
      fireAlarmPanelMake: form.fireAlarmPanelMake || undefined,
      fireAlarmPanelModel: form.fireAlarmPanelModel || undefined,
      fireAlarmPanelLocation: form.fireAlarmPanelLocation || undefined,
      annunciatorLocation: form.annunciatorLocation || undefined,
      monitoringCompany: form.monitoringCompany || undefined,
      monitoringPhone: form.monitoringPhone || undefined,
      monitoringAccount: form.monitoringAccount || undefined,
      sprinklerNotes: form.sprinklerNotes || undefined,
      backflowNotes: form.backflowNotes || undefined,
      emergencyLightingNotes: form.emergencyLightingNotes || undefined,
      fireExtinguisherNotes: form.fireExtinguisherNotes || undefined,
      generalNotes: form.generalNotes || undefined,
    });
  };

  const handleReset = () => {
    if (info) {
      setForm({
        siteContactName: info.siteContactName ?? "",
        siteContactPhone: info.siteContactPhone ?? "",
        siteContactEmail: info.siteContactEmail ?? "",
        propertyManagerName: info.propertyManagerName ?? "",
        propertyManagerPhone: info.propertyManagerPhone ?? "",
        propertyManagerEmail: info.propertyManagerEmail ?? "",
        accessNotes: info.accessNotes ?? "",
        keyLocation: info.keyLocation ?? "",
        keyNumber: info.keyNumber ?? "",
        lockboxCode: info.lockboxCode ?? "",
        parkingNotes: info.parkingNotes ?? "",
        serviceEntranceNotes: info.serviceEntranceNotes ?? "",
        fireAlarmPanelMake: info.fireAlarmPanelMake ?? "",
        fireAlarmPanelModel: info.fireAlarmPanelModel ?? "",
        fireAlarmPanelLocation: info.fireAlarmPanelLocation ?? "",
        annunciatorLocation: info.annunciatorLocation ?? "",
        monitoringCompany: info.monitoringCompany ?? "",
        monitoringPhone: info.monitoringPhone ?? "",
        monitoringAccount: info.monitoringAccount ?? "",
        sprinklerNotes: info.sprinklerNotes ?? "",
        backflowNotes: info.backflowNotes ?? "",
        emergencyLightingNotes: info.emergencyLightingNotes ?? "",
        fireExtinguisherNotes: info.fireExtinguisherNotes ?? "",
        generalNotes: info.generalNotes ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setDirty(false);
  };

  const f = (key: keyof InfoForm) => ({
    ...field(form, (updater) => { setForm(updater); setDirty(true); }, key),
  });

  if (siteLoading || infoLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Back + header */}
        <div>
          <Link href="/admin/sites">
            <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Sites
            </Button>
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                {site?.name ?? `Site #${siteId}`}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {site?.buildingId && (
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {site.buildingId}
                  </span>
                )}
                {site?.fileNumber && (
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                    {site.fileNumber}
                  </span>
                )}
                <span className="text-sm text-muted-foreground">Work Site Info</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!dirty || saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>

        {/* 1. Contacts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Contacts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Site Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input placeholder="Site contact name" {...f("siteContactName")} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input placeholder="(123) 456-7890" {...f("siteContactPhone")} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" placeholder="contact@example.com" {...f("siteContactEmail")} />
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">Property Manager</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input placeholder="Property manager name" {...f("propertyManagerName")} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input placeholder="(123) 456-7890" {...f("propertyManagerPhone")} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" placeholder="pm@example.com" {...f("propertyManagerEmail")} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Access / Keys */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Access / Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Key Location</Label>
                <Input placeholder="e.g. Lockbox at front entrance" {...f("keyLocation")} />
              </div>
              <div className="space-y-1">
                <Label>Key Number</Label>
                <Input placeholder="e.g. K-042" {...f("keyNumber")} />
              </div>
              <div className="space-y-1">
                <Label>Lockbox Code</Label>
                <Input placeholder="4-digit code" {...f("lockboxCode")} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Access Notes</Label>
              <Textarea placeholder="General access instructions…" rows={2} {...f("accessNotes")} />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <DoorOpen className="h-3 w-3" /> Service Entrance Notes
              </Label>
              <Textarea placeholder="Service entrance location, door codes…" rows={2} {...f("serviceEntranceNotes")} />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <Car className="h-3 w-3" /> Parking Notes
              </Label>
              <Textarea placeholder="Parking instructions…" rows={2} {...f("parkingNotes")} />
            </div>
          </CardContent>
        </Card>

        {/* 3. Fire Alarm Panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              Fire Alarm Panel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Panel Make</Label>
                <Input placeholder="e.g. Notifier" {...f("fireAlarmPanelMake")} />
              </div>
              <div className="space-y-1">
                <Label>Panel Model</Label>
                <Input placeholder="e.g. NFS2-3030" {...f("fireAlarmPanelModel")} />
              </div>
              <div className="space-y-1">
                <Label>Panel Location</Label>
                <Input placeholder="e.g. Main electrical room, B1" {...f("fireAlarmPanelLocation")} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Annunciator Location</Label>
              <Input placeholder="e.g. Main lobby, near elevator" {...f("annunciatorLocation")} />
            </div>
          </CardContent>
        </Card>

        {/* 4. Monitoring */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Monitoring Company</Label>
                <Input placeholder="Company name" {...f("monitoringCompany")} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input placeholder="(123) 456-7890" {...f("monitoringPhone")} />
              </div>
              <div className="space-y-1">
                <Label>Account Number</Label>
                <Input placeholder="Account / pass phrase" {...f("monitoringAccount")} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5. Sprinkler / Backflow */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Droplets className="h-4 w-4 text-primary" />
              Sprinkler / Backflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Sprinkler Notes</Label>
              <Textarea placeholder="Sprinkler system details, valve locations…" rows={2} {...f("sprinklerNotes")} />
            </div>
            <div className="space-y-1">
              <Label>Backflow Notes</Label>
              <Textarea placeholder="Backflow preventer location, type…" rows={2} {...f("backflowNotes")} />
            </div>
          </CardContent>
        </Card>

        {/* 6. Emergency Lighting / Fire Extinguishers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Emergency Lighting / Fire Extinguishers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Emergency Lighting Notes</Label>
              <Textarea placeholder="Emergency lighting details, locations…" rows={2} {...f("emergencyLightingNotes")} />
            </div>
            <div className="space-y-1">
              <Label>Fire Extinguisher Notes</Label>
              <Textarea placeholder="Extinguisher types, quantity, locations…" rows={2} {...f("fireExtinguisherNotes")} />
            </div>
          </CardContent>
        </Card>

        {/* 7. General Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              General Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Any additional site-specific information…"
              rows={4}
              {...f("generalNotes")}
            />
          </CardContent>
        </Card>

        {/* 8. Source / Import Info */}
        {info?.sourceWorkbookName && (
          <Card className="border-dashed">
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                Workbook Source
              </p>
              <p className="text-sm">
                <span className="font-medium">{info.sourceWorkbookName}</span>
                {info.sourceSheetName && (
                  <span className="text-muted-foreground"> — sheet: {info.sourceSheetName}</span>
                )}
              </p>
              {info.lastImportedFromWorkbook && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last imported {new Date(info.lastImportedFromWorkbook).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bottom save row */}
        <div className="flex justify-end gap-2 pb-8">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saveMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
