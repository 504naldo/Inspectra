import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Search,
  Plus,
  Building2,
  MapPin,
  Phone,
  FileImage,
  Upload,
  MoreHorizontal,
  Flame,
  Key,
  KeyRound,
  HardDrive,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Info,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { DriveImportPicker } from "@/components/DriveImportPicker";

function SiteCard({
  site,
  customerMap,
  onEdit,
}: {
  site: any;
  customerMap: Map<number, string>;
  onEdit: (site: any) => void;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const { data: info, isLoading: infoLoading } = trpc.workSiteInfo.getBySiteId.useQuery(
    { siteId: site.id },
    { enabled: isFlipped, staleTime: 30_000 }
  );

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-4">
        <AnimatePresence mode="wait" initial={false}>
          {!isFlipped ? (
            <motion.div
              key="front"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{site.name}</h3>
                    {site.buildingId && (
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{site.buildingId}</span>
                    )}
                    {site.fileNumber && (
                      <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">{site.fileNumber}</span>
                    )}
                  </div>
                  {site.customerOrgId && customerMap.get(site.customerOrgId) && (
                    <p className="text-xs text-muted-foreground mt-0.5">{customerMap.get(site.customerOrgId)}</p>
                  )}
                  {site.address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {site.address}
                      {site.city && `, ${site.city}`}
                      {site.state && `, ${site.state}`}
                    </p>
                  )}
                  {site.contactPhone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Phone className="h-3 w-3" />
                      {site.contactPhone}
                    </p>
                  )}
                  {site.keyNumber && (
                    <p className="text-sm flex items-center gap-1 mt-1">
                      <Key className="h-3 w-3 text-[var(--warning)]" />
                      <span className="text-[var(--warning)] font-medium">Key {site.keyNumber}</span>
                      {site.keyLocation && <span className="text-muted-foreground">— {site.keyLocation}</span>}
                      {site.keySignedOutBy && (
                        <span className="ml-1 text-[var(--warning)] font-medium text-xs">(Out: {site.keySignedOutBy})</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsFlipped(true)}
                    title="Work Site Info"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(site)}>
                        <KeyRound className="h-4 w-4 mr-2" />
                        Edit Site
                      </DropdownMenuItem>
                      <Link href={`/admin/sites/${site.id}/files`}>
                        <DropdownMenuItem>
                          <FileImage className="h-4 w-4 mr-2" />
                          Manage Files
                        </DropdownMenuItem>
                      </Link>
                      <Link href={`/admin/sites/${site.id}/import`}>
                        <DropdownMenuItem>
                          <Upload className="h-4 w-4 mr-2" />
                          Import Assets
                        </DropdownMenuItem>
                      </Link>
                      <Link href={`/admin/sites/${site.id}/fire-alarm`}>
                        <DropdownMenuItem>
                          <Flame className="h-4 w-4 mr-2" />
                          Fire Alarm Setup
                        </DropdownMenuItem>
                      </Link>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="back"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Back face header */}
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{site.name}</h3>
                  <p className="text-xs text-muted-foreground">Work Site Info</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setIsFlipped(false)}
                  title="Back to site card"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              {infoLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : info ? (
                <div className="space-y-2 text-sm">
                  {(info.siteContactName || info.siteContactPhone) && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        {info.siteContactName}
                        {info.siteContactPhone && ` · ${info.siteContactPhone}`}
                      </span>
                    </div>
                  )}
                  {(info.keyNumber || info.keyLocation) && (
                    <div className="flex items-start gap-1.5">
                      <Key className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[var(--warning)]" />
                      <span className="text-[var(--warning)] font-medium">
                        {info.keyNumber && `Key ${info.keyNumber}`}
                        {info.keyLocation && ` — ${info.keyLocation}`}
                        {info.lockboxCode && ` (code: ${info.lockboxCode})`}
                      </span>
                    </div>
                  )}
                  {(info.fireAlarmPanelMake || info.fireAlarmPanelLocation) && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <Flame className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        {[info.fireAlarmPanelMake, info.fireAlarmPanelModel].filter(Boolean).join(" ")}
                        {info.fireAlarmPanelLocation && ` — ${info.fireAlarmPanelLocation}`}
                      </span>
                    </div>
                  )}
                  {info.monitoringCompany && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        {info.monitoringCompany}
                        {info.monitoringPhone && ` · ${info.monitoringPhone}`}
                      </span>
                    </div>
                  )}
                  {info.accessNotes && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic">{info.accessNotes}</p>
                  )}
                  <Link href={`/admin/sites/${site.id}/work-site-info`}>
                    <Button size="sm" className="w-full mt-3">
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      Open Work Site Info
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-5">
                  <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No Work Site Info yet</p>
                  <Link href={`/admin/sites/${site.id}/work-site-info`}>
                    <Button variant="outline" size="sm" className="mt-3">
                      <Plus className="h-3.5 w-3.5 mr-2" />
                      Add Work Site Info
                    </Button>
                  </Link>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export default function AdminSites() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? 0;

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showDriveImport, setShowDriveImport] = useState(false);
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [pdfImportPreview, setPdfImportPreview] = useState<any | null>(null);
  const [isPdfExtracting, setIsPdfExtracting] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();
  const [editSite, setEditSite] = useState<any>(null);
  const [newSite, setNewSite] = useState({
    name: "",
    buildingId: "",
    customerOrgId: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    keyLocation: "",
    keyNumber: "",
  });

  const { data: sites, isLoading, refetch } = trpc.site.listByCompany.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: customers } = trpc.customerOrg.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  // Pre-fetch the customer records Drive root so the import picker opens there directly
  const { data: driveRoot } = trpc.customerRecords.getRootFolderId.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });

  const createSite = trpc.site.create.useMutation({
    onSuccess: () => {
      toast.success('Site created');
      setIsCreateOpen(false);
      setNewSite({
        name: "",
        buildingId: "",
        customerOrgId: "",
        address: "",
        city: "",
        state: "",
        postalCode: "",
        contactName: "",
        contactPhone: "",
        contactEmail: "",
        keyLocation: "",
        keyNumber: "",
      });
      refetch();
    },
    onError: () => toast.error('Failed to create site')
  });

  const updateSite = trpc.site.update.useMutation({
    onSuccess: () => {
      toast.success('Site updated');
      setIsEditOpen(false);
      setEditSite(null);
      refetch();
    },
    onError: () => toast.error('Failed to update site')
  });

  const pdfUploadMutation = trpc.drive.importPdfFromUpload.useMutation({
    onSuccess: (data) => {
      setIsPdfExtracting(false);
      setPdfImportPreview(data);
    },
    onError: (err) => {
      setIsPdfExtracting(false);
      toast.error(err.message || "Failed to extract data from PDF");
    },
  });

  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Sites">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setIsPdfExtracting(true);
      setPdfImportPreview(null);
      pdfUploadMutation.mutate({ fileName: file.name, fileData: base64, companyId });
    };
    reader.readAsDataURL(file);
    // reset so same file can be re-selected
    e.target.value = "";
  };

  const handleConfirmPdfImport = () => {
    if (!pdfImportPreview) return;
    toast.success(`Site "${pdfImportPreview.siteName}" created from PDF`);
    refetch();
    setShowPdfImport(false);
    setPdfImportPreview(null);
    navigate(`/admin/sites/${pdfImportPreview.siteId}/import`);
  };

  const customerMap = new Map<number, string>(
    customers?.map((c: any) => [c.id, c.name]) ?? []
  );

  const filteredSites = sites?.filter((site: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      site.name.toLowerCase().includes(q) ||
      site.address?.toLowerCase().includes(q) ||
      site.city?.toLowerCase().includes(q) ||
      site.buildingId?.toLowerCase().includes(q) ||
      site.fileNumber?.toLowerCase().includes(q) ||
      site.contactName?.toLowerCase().includes(q) ||
      customerMap.get(site.customerOrgId)?.toLowerCase().includes(q)
    );
  }) || [];

  const handleCreateSite = () => {
    if (!newSite.name || !newSite.customerOrgId) {
      toast.error('Please fill in required fields');
      return;
    }
    createSite.mutate({
      companyId,
      customerOrgId: parseInt(newSite.customerOrgId),
      name: newSite.name,
      buildingId: newSite.buildingId || undefined,
      address: newSite.address || undefined,
      city: newSite.city || undefined,
      state: newSite.state || undefined,
      postalCode: newSite.postalCode || undefined,
      contactName: newSite.contactName || undefined,
      contactPhone: newSite.contactPhone || undefined,
      contactEmail: newSite.contactEmail || undefined,
      keyLocation: newSite.keyLocation || undefined,
      keyNumber: newSite.keyNumber || undefined,
    });
  };

  return (
    <AdminLayout title="Sites">
      <div className="space-y-6">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sites..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Button variant="outline" onClick={() => setShowDriveImport(true)}>
            <HardDrive className="h-4 w-4 mr-2" />
            Import from Drive
          </Button>

          <Button variant="outline" onClick={() => setShowPdfImport(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Import from PDF
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Site
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Site</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Site Name *</Label>
                  <Input
                    value={newSite.name}
                    onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                    placeholder="Site name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Building ID <span className="text-muted-foreground text-xs">(file / account number)</span></Label>
                  <Input
                    value={newSite.buildingId}
                    onChange={(e) => setNewSite({ ...newSite, buildingId: e.target.value })}
                    placeholder="e.g. EWF-1234"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <Select
                    value={newSite.customerOrgId}
                    onValueChange={(v) => setNewSite({ ...newSite, customerOrgId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={newSite.address}
                    onChange={(e) => setNewSite({ ...newSite, address: e.target.value })}
                    placeholder="Street address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={newSite.city}
                      onChange={(e) => setNewSite({ ...newSite, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State/Province</Label>
                    <Input
                      value={newSite.state}
                      onChange={(e) => setNewSite({ ...newSite, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Postal Code</Label>
                    <Input
                      value={newSite.postalCode}
                      onChange={(e) => setNewSite({ ...newSite, postalCode: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={newSite.contactName}
                    onChange={(e) => setNewSite({ ...newSite, contactName: e.target.value })}
                    placeholder="Primary contact name"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input
                      value={newSite.contactPhone}
                      onChange={(e) => setNewSite({ ...newSite, contactPhone: e.target.value })}
                      placeholder="(123) 456-7890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Email</Label>
                    <Input
                      value={newSite.contactEmail}
                      onChange={(e) => setNewSite({ ...newSite, contactEmail: e.target.value })}
                      placeholder="contact@example.com"
                      type="email"
                    />
                  </div>
                </div>

                {/* Key Tracking */}
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                    <Key className="h-3 w-3" /> Key Tracking
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Key Location</Label>
                      <Input
                        value={newSite.keyLocation}
                        onChange={(e) => setNewSite({ ...newSite, keyLocation: e.target.value })}
                        placeholder="e.g. Lockbox at front entrance"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Key Number</Label>
                      <Input
                        value={newSite.keyNumber}
                        onChange={(e) => setNewSite({ ...newSite, keyNumber: e.target.value })}
                        placeholder="e.g. K-042"
                      />
                    </div>
                  </div>
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleCreateSite}
                  disabled={createSite.isPending}
                >
                  {createSite.isPending ? 'Creating...' : 'Create Site'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Sites List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredSites.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No sites found</p>
              <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Site
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSites.map((site: any) => (
              <SiteCard
                key={site.id}
                site={site}
                customerMap={customerMap}
                onEdit={(s) => {
                  setEditSite({
                    ...s,
                    contactEmail: s.summary?.contacts?.[0]?.email ?? "",
                    keySignOutDate: s.keySignOutDate
                      ? new Date(s.keySignOutDate).toISOString().split("T")[0]
                      : "",
                  });
                  setIsEditOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Site Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Edit Site — {editSite?.name}
            </DialogTitle>
          </DialogHeader>
          {editSite && (
            <div className="space-y-4 py-2">
              {/* Basic Info */}
              <div className="space-y-2">
                <Label>Site Name *</Label>
                <Input value={editSite.name ?? ""} onChange={(e) => setEditSite({ ...editSite, name: e.target.value })} placeholder="Site name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Building ID</Label>
                  <Input value={editSite.buildingId ?? ""} onChange={(e) => setEditSite({ ...editSite, buildingId: e.target.value })} placeholder="e.g. EWF-1234" />
                </div>
                <div className="space-y-2">
                  <Label>File Number</Label>
                  <Input value={editSite.fileNumber ?? ""} onChange={(e) => setEditSite({ ...editSite, fileNumber: e.target.value })} placeholder="e.g. #0007" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Customer</Label>
                <Select
                  value={String(editSite.customerOrgId ?? "")}
                  onValueChange={(v) => setEditSite({ ...editSite, customerOrgId: v ? parseInt(v) : undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Address */}
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Address
                </p>
                <div className="space-y-2">
                  <Input value={editSite.address ?? ""} onChange={(e) => setEditSite({ ...editSite, address: e.target.value })} placeholder="Street address" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={editSite.city ?? ""} onChange={(e) => setEditSite({ ...editSite, city: e.target.value })} placeholder="City" />
                    <Input value={editSite.state ?? ""} onChange={(e) => setEditSite({ ...editSite, state: e.target.value })} placeholder="Province" />
                    <Input value={editSite.postalCode ?? ""} onChange={(e) => setEditSite({ ...editSite, postalCode: e.target.value })} placeholder="Postal Code" />
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Contact
                </p>
                <div className="space-y-2">
                  <Input value={editSite.contactName ?? ""} onChange={(e) => setEditSite({ ...editSite, contactName: e.target.value })} placeholder="Contact name" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editSite.contactPhone ?? ""} onChange={(e) => setEditSite({ ...editSite, contactPhone: e.target.value })} placeholder="Phone" />
                    <Input type="email" value={editSite.contactEmail ?? ""} onChange={(e) => setEditSite({ ...editSite, contactEmail: e.target.value })} placeholder="Email" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Notes
                </p>
                <Textarea value={editSite.notes ?? ""} onChange={(e) => setEditSite({ ...editSite, notes: e.target.value })} placeholder="Internal notes…" rows={2} />
              </div>

              {/* Key Tracking */}
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <Key className="h-3 w-3" /> Key Tracking
                </p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editSite.keyLocation ?? ""} onChange={(e) => setEditSite({ ...editSite, keyLocation: e.target.value })} placeholder="Key location" />
                    <Input value={editSite.keyNumber ?? ""} onChange={(e) => setEditSite({ ...editSite, keyNumber: e.target.value })} placeholder="Key number" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Sign-out date</Label>
                      <Input type="date" value={editSite.keySignOutDate ?? ""} onChange={(e) => setEditSite({ ...editSite, keySignOutDate: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Signed out by</Label>
                      <Input value={editSite.keySignedOutBy ?? ""} onChange={(e) => setEditSite({ ...editSite, keySignedOutBy: e.target.value })} placeholder="Name" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => { setIsEditOpen(false); setEditSite(null); }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => updateSite.mutate({
                    id: editSite.id,
                    name: editSite.name,
                    buildingId: editSite.buildingId,
                    fileNumber: editSite.fileNumber,
                    customerOrgId: editSite.customerOrgId ? Number(editSite.customerOrgId) : undefined,
                    address: editSite.address,
                    city: editSite.city,
                    state: editSite.state,
                    postalCode: editSite.postalCode,
                    contactName: editSite.contactName,
                    contactPhone: editSite.contactPhone,
                    contactEmail: editSite.contactEmail,
                    notes: editSite.notes,
                    keyLocation: editSite.keyLocation,
                    keyNumber: editSite.keyNumber,
                    keySignOutDate: editSite.keySignOutDate,
                    keySignedOutBy: editSite.keySignedOutBy,
                  })}
                  disabled={updateSite.isPending || !editSite.name?.trim()}
                >
                  {updateSite.isPending ? "Saving..." : "Save Site"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Google Drive Import Picker */}
      <DriveImportPicker
        open={showDriveImport}
        onOpenChange={setShowDriveImport}
        companyId={companyId}
        initialFolderId={driveRoot?.folderId ?? undefined}
        onImportComplete={(result) => {
          refetch();
          if (result.isPdfImport) {
            // PDF import: site + devices already created by AI, go straight to site files
            navigate(`/admin/sites/${result.siteId}/files`);
          } else {
            // Spreadsheet import: continue to asset import wizard
            navigate(`/admin/sites/${result.siteId}/import`);
          }
        }}
      />

      {/* PDF Import Dialog */}
      <Dialog open={showPdfImport} onOpenChange={(o) => { if (!o) { setShowPdfImport(false); setPdfImportPreview(null); setIsPdfExtracting(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Import from PDF Report
            </DialogTitle>
          </DialogHeader>

          {/* Hidden file input */}
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handlePdfFileChange}
          />

          {!isPdfExtracting && !pdfImportPreview && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="p-4 rounded-full bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium">Upload a fire inspection report PDF</p>
                <p className="text-sm text-muted-foreground mt-1">
                  AI will extract site info and device lists automatically.
                </p>
              </div>
              <Button onClick={() => pdfInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Choose PDF File
              </Button>
            </div>
          )}

          {isPdfExtracting && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium text-sm">AI is extracting site data…</p>
              <p className="text-xs text-muted-foreground">This takes 5–15 seconds.</p>
            </div>
          )}

          {pdfImportPreview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Extraction complete
                </p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                  pdfImportPreview.summary.confidence === "high"
                    ? "text-green-600 bg-green-50 border-green-200"
                    : pdfImportPreview.summary.confidence === "medium"
                    ? "text-yellow-600 bg-yellow-50 border-yellow-200"
                    : "text-red-600 bg-red-50 border-red-200"
                }`}>
                  {pdfImportPreview.summary.confidence} confidence
                </span>
              </div>

              {/* Site info */}
              <div className="rounded-lg border p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Site
                </p>
                <p className="font-semibold">{pdfImportPreview.siteInfo.name || pdfImportPreview.siteName}</p>
                {(pdfImportPreview.siteInfo.address || pdfImportPreview.siteInfo.city) && (
                  <p className="text-sm text-muted-foreground">
                    {[pdfImportPreview.siteInfo.address, pdfImportPreview.siteInfo.city, pdfImportPreview.siteInfo.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {pdfImportPreview.siteInfo.contactName && (
                  <p className="text-sm text-muted-foreground">
                    Contact: {pdfImportPreview.siteInfo.contactName}
                    {pdfImportPreview.siteInfo.contactPhone && ` · ${pdfImportPreview.siteInfo.contactPhone}`}
                  </p>
                )}
              </div>

              {/* Device summary */}
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Cpu className="h-3 w-3" /> Devices found: {pdfImportPreview.summary.totalDevices}
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(pdfImportPreview.summary.categories as Record<string,number>)
                    .filter(([, c]) => c > 0)
                    .map(([cat, count]) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat.replace(/_/g, " ")}: {String(count)}
                      </Badge>
                    ))}
                </div>
              </div>

              {pdfImportPreview.summary.warnings?.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-1">
                  <p className="text-xs font-medium text-yellow-700 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Warnings
                  </p>
                  {pdfImportPreview.summary.warnings.map((w: string, i: number) => (
                    <p key={i} className="text-xs text-yellow-600">{w}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={handleConfirmPdfImport}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm Import
                </Button>
                <Button variant="outline" onClick={() => { setPdfImportPreview(null); pdfInputRef.current?.click(); }}>
                  Try Different File
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
