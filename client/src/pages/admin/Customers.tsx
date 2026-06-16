import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePortalPreview } from "@/contexts/PortalPreviewContext";
import { useLocation } from "wouter";
import {
  Search,
  Plus,
  Building2,
  Mail,
  Phone,
  User,
  Pencil,
  Save,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminCustomers() {
  const { user } = useAuth();
  const { setPreviewOrg } = usePortalPreview();
  const [, setLocation] = useLocation();

  const companyId = user?.companyId ?? 0;

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
  });

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Edit state
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const { data: customers, isLoading, refetch } = trpc.customerOrg.list.useQuery(
    { companyId },
    { enabled: !!user?.companyId }
  );

  const createCustomer = trpc.customerOrg.create.useMutation({
    onSuccess: () => {
      toast.success("Customer created");
      setIsCreateOpen(false);
      setNewCustomer({ name: "", contactName: "", contactEmail: "", contactPhone: "", address: "" });
      refetch();
    },
    onError: () => toast.error("Failed to create customer"),
  });

  const deleteCustomer = trpc.customerOrg.delete.useMutation({
    onSuccess: () => {
      toast.success("Customer deleted");
      setDeleteTarget(null);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to delete customer"),
  });

  const updateCustomer = trpc.customerOrg.update.useMutation({
    onSuccess: () => {
      toast.success("Customer updated");
      setEditCustomer(null);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to update customer"),
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

  function openEdit(customer: any) {
    setEditCustomer(customer);
    setEditName(customer.name ?? "");
    setEditContactName(customer.contactName ?? "");
    setEditContactEmail(customer.contactEmail ?? "");
    setEditContactPhone(customer.contactPhone ?? "");
    setEditAddress(customer.address ?? "");
  }

  const handleCreateCustomer = () => {
    if (!newCustomer.name) {
      toast.error("Please enter a customer name");
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

  const handleViewPortal = (customer: any) => {
    setPreviewOrg({ id: customer.id, name: customer.name });
    setLocation("/customer");
  };

  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Customers">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

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
                  <Label>Company Name <span className="text-destructive">*</span></Label>
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
                <Button className="w-full" onClick={handleCreateCustomer} disabled={createCustomer.isPending}>
                  {createCustomer.isPending ? "Creating..." : "Create Customer"}
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
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold leading-tight">{customer.name}</h3>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => handleViewPortal(customer)}
                        title="Preview customer portal"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(customer)}
                        title="Edit customer"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(customer)}
                        title="Delete customer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 pl-1">
                    {customer.contactName && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3 w-3 shrink-0" />
                        <span>{customer.contactName}</span>
                      </p>
                    )}
                    {customer.contactEmail && (
                      <p className="text-sm text-muted-foreground flex items-start gap-1.5">
                        <Mail className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="break-all">{customer.contactEmail}</span>
                      </p>
                    )}
                    {customer.contactPhone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{customer.contactPhone}</span>
                      </p>
                    )}
                    {customer.address && (
                      <p className="text-sm text-muted-foreground flex items-start gap-1.5">
                        <Building2 className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>{customer.address}</span>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the customer. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCustomer.mutate({ id: deleteTarget.id })}
              disabled={deleteCustomer.isPending}
            >
              {deleteCustomer.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editCustomer} onOpenChange={(open) => { if (!open) setEditCustomer(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Customer
            </DialogTitle>
            <DialogDescription>Update customer organisation details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Company Name <span className="text-destructive">*</span></Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Customer company name" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Name</Label>
              <Input value={editContactName} onChange={(e) => setEditContactName(e.target.value)} placeholder="Primary contact name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={editContactEmail}
                  onChange={(e) => setEditContactEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Phone</Label>
                <Input
                  value={editContactPhone}
                  onChange={(e) => setEditContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Business address" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditCustomer(null)} disabled={updateCustomer.isPending}>
                Cancel
              </Button>
              <Button
                disabled={!editName.trim() || updateCustomer.isPending}
                onClick={() =>
                  updateCustomer.mutate({
                    id: editCustomer.id,
                    name: editName.trim(),
                    contactName: editContactName || undefined,
                    contactEmail: editContactEmail || undefined,
                    contactPhone: editContactPhone || undefined,
                    address: editAddress || undefined,
                  })
                }
              >
                {updateCustomer.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Save Changes</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
