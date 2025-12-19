import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { 
  Search, 
  Plus,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AdminDevices() {
  const { user } = useAuth();
  const companyId = user?.companyId || 1;
  
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sites } = trpc.site.listByCompany.useQuery({ companyId });
  
  const { data: devices, isLoading } = trpc.device.listBySite.useQuery(
    { siteId: parseInt(selectedSiteId) },
    { enabled: selectedSiteId !== "all" && selectedSiteId !== "" }
  );

  const filteredDevices = devices?.filter((device: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      device.deviceType.toLowerCase().includes(query) ||
      device.location?.toLowerCase().includes(query) ||
      device.manufacturer?.toLowerCase().includes(query) ||
      device.serialNumber?.toLowerCase().includes(query)
    );
  }) || [];

  return (
    <AdminLayout title="Devices">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Select a site...</SelectItem>
              {sites?.map((site: any) => (
                <SelectItem key={site.id} value={site.id.toString()}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              disabled={selectedSiteId === "all"}
            />
          </div>

          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            Add Device
          </Button>
        </div>

        {/* Content */}
        {selectedSiteId === "all" ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a site to view devices</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No devices found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredDevices.map((device: any) => (
              <Card key={device.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{device.deviceType}</h3>
                      {device.location && (
                        <p className="text-sm text-muted-foreground truncate">{device.location}</p>
                      )}
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {device.manufacturer && <p>Mfr: {device.manufacturer}</p>}
                        {device.model && <p>Model: {device.model}</p>}
                        {device.serialNumber && <p>S/N: {device.serialNumber}</p>}
                      </div>
                      <div className="mt-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          device.isActive ? 'status-pass' : 'status-fail'
                        }`}>
                          {device.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
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
