import { useState, useRef } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { DriveImportPicker } from "@/components/DriveImportPicker";

export default function AdminSites() {
  const { user } = useAuth();
  
  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Sites">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }
  
  const companyId = user.companyId;
  
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

  const { data: sites, isLoading, refetch } = trpc.site.listByCompany.useQuery({ companyId });
  const { data: customers } = trpc.customerOrg.list.useQuery({ companyId });
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

  const filteredSites = sites?.filter((site: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      site.name.toLowerCase().includes(query) ||
      site.address?.toLowerCase().includes(query) ||
      site.city?.toLowerCase().includes(query)
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
              <Card key={site.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{site.name}</h3>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditSite({...site}); setIsEditOpen(true); }}>
                          <KeyRound className="h-4 w-4 mr-2" />
                          Edit Key Info
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Key Info Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Key Information — {editSite?.name}
            </DialogTitle>
          </DialogHeader>
          {editSite && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Key Location</Label>
                <Input
                  value={editSite.keyLocation ?? ""}
                  onChange={(e) => setEditSite({ ...editSite, keyLocation: e.target.value })}
                  placeholder="e.g. Lockbox at front entrance"
                />
              </div>
              <div className="space-y-2">
                <Label>Key Number</Label>
                <Input
                  value={editSite.keyNumber ?? ""}
                  onChange={(e) => setEditSite({ ...editSite, keyNumber: e.target.value })}
                  placeholder="e.g. K-042"
                />
              </div>
              <div className="space-y-2">
                <Label>Signed Out By <span className="text-muted-foreground text-xs">(leave blank to clear)</span></Label>
                <Input
                  value={editSite.keySignedOutBy ?? ""}
                  onChange={(e) => setEditSite({ ...editSite, keySignedOutBy: e.target.value })}
                  placeholder="Technician name"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => updateSite.mutate({
                  id: editSite.id,
                  keyLocation: editSite.keyLocation || undefined,
                  keyNumber: editSite.keyNumber || undefined,
                  keySignedOutBy: editSite.keySignedOutBy || undefined,
                })}
                disabled={updateSite.isPending}
              >
                {updateSite.isPending ? "Saving..." : "Save Key Info"}
              </Button>
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
          toast.success(`Site "${result.siteName}" created from Drive`);
          refetch();
          navigate(`/admin/sites/${result.siteId}/import`);
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
