import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { 
  Search, 
  Plus,
  Building2,
  MapPin,
  Phone
} from "lucide-react";
import { toast } from "sonner";

export default function AdminSites() {
  const { user } = useAuth();
  const companyId = user?.companyId || 1;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSite, setNewSite] = useState({
    name: "",
    customerOrgId: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    contactName: "",
    contactPhone: "",
  });

  const { data: sites, isLoading, refetch } = trpc.site.listByCompany.useQuery({ companyId });
  const { data: customers } = trpc.customerOrg.list.useQuery({ companyId });

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
      });
      refetch();
    },
    onError: () => toast.error('Failed to create site')
  });

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
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Site
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
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
                    <Label>State</Label>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Name</Label>
                    <Input
                      value={newSite.contactName}
                      onChange={(e) => setNewSite({ ...newSite, contactName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input
                      value={newSite.contactPhone}
                      onChange={(e) => setNewSite({ ...newSite, contactPhone: e.target.value })}
                    />
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
