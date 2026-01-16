import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { 
  Search, 
  Plus,
  Building2,
  Mail,
  Phone,
  User
} from "lucide-react";
import { toast } from "sonner";

export default function AdminCustomers() {
  const { user } = useAuth();
  
  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Customers">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }
  
  const companyId = user.companyId;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
  });

  const { data: customers, isLoading, refetch } = trpc.customerOrg.list.useQuery({ companyId });

  const createCustomer = trpc.customerOrg.create.useMutation({
    onSuccess: () => {
      toast.success('Customer created');
      setIsCreateOpen(false);
      setNewCustomer({
        name: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        address: "",
      });
      refetch();
    },
    onError: () => toast.error('Failed to create customer')
  });

  const filteredCustomers = customers?.filter((customer: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.contactName?.toLowerCase().includes(query) ||
      customer.contactEmail?.toLowerCase().includes(query)
    );
  }) || [];

  const handleCreateCustomer = () => {
    if (!newCustomer.name) {
      toast.error('Please enter a customer name');
      return;
    }
    createCustomer.mutate({
      companyId,
      name: newCustomer.name,
      contactName: newCustomer.contactName || undefined,
      contactEmail: newCustomer.contactEmail || undefined,
      contactPhone: newCustomer.contactPhone || undefined,
      address: newCustomer.address || undefined,
    });
  };

  return (
    <AdminLayout title="Customers">
      <div className="space-y-6">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Company Name *</Label>
                  <Input
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    placeholder="Customer company name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={newCustomer.contactName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, contactName: e.target.value })}
                    placeholder="Primary contact name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Email</Label>
                    <Input
                      type="email"
                      value={newCustomer.contactEmail}
                      onChange={(e) => setNewCustomer({ ...newCustomer, contactEmail: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input
                      value={newCustomer.contactPhone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, contactPhone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    placeholder="Business address"
                  />
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleCreateCustomer}
                  disabled={createCustomer.isPending}
                >
                  {createCustomer.isPending ? 'Creating...' : 'Create Customer'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Customers List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No customers found</p>
              <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Customer
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCustomers.map((customer: any) => (
              <Card key={customer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{customer.name}</h3>
                      {customer.contactName && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <User className="h-3 w-3" />
                          {customer.contactName}
                        </p>
                      )}
                      {customer.contactEmail && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Mail className="h-3 w-3" />
                          {customer.contactEmail}
                        </p>
                      )}
                      {customer.contactPhone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Phone className="h-3 w-3" />
                          {customer.contactPhone}
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
