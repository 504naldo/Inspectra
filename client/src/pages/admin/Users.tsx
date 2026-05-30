import { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Search, UserPlus, Edit, Users as UsersIcon, Award, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

export default function AdminUsers() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editCertNumber, setEditCertNumber] = useState('');
  const [editCertLevel, setEditCertLevel] = useState('');
  const [editCertExpiry, setEditCertExpiry] = useState('');

  const [editCustomerOrgId, setEditCustomerOrgId] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Add User dialog state
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'office' | 'technician' | 'customer'>('technician');
  const [newCustomerOrgId, setNewCustomerOrgId] = useState<string>('');

  const utils = trpc.useUtils();

  const { data: customerOrgs } = trpc.customerOrg.list.useQuery(
    { companyId: user?.companyId! },
    { enabled: !!user?.companyId }
  );

  const createUserMutation = trpc.user.createUser.useMutation({
    onSuccess: () => {
      toast.success('User pre-registered. They can now sign in with Google.');
      setAddUserOpen(false);
      setNewEmail('');
      setNewName('');
      setNewRole('technician');
      setNewCustomerOrgId('');
      utils.user.listUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create user');
    },
  });

  const deleteUserMutation = trpc.user.deleteUser.useMutation({
    onSuccess: () => {
      toast.success('User removed');
      setConfirmDeleteId(null);
      utils.user.listUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove user');
    },
  });

  const updateUserMutation = trpc.user.updateUser.useMutation({
    onSuccess: () => {
      toast.success('User updated successfully');
      setEditingUser(null);
      utils.user.listUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update user');
    },
  });

  const handleEditUser = (u: any) => {
    setEditingUser(u.id);
    setEditName(u.name || '');
    setEditRole(u.role);
    setEditCustomerOrgId(u.customerOrgId ? String(u.customerOrgId) : '');
    setEditIsActive(!!u.isActive);
    setEditCertNumber(u.certNumber || '');
    setEditCertLevel(u.certificationLevel || '');
    // certExpiry comes back as a Date or ISO string; normalise to YYYY-MM-DD for <input type="date">
    if (u.certExpiry) {
      const d = new Date(u.certExpiry);
      setEditCertExpiry(d.toISOString().slice(0, 10));
    } else {
      setEditCertExpiry('');
    }
  };

  const handleSaveUser = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      userId: editingUser,
      name: editName,
      role: editRole as any,
      isActive: editIsActive,
      certNumber: editCertNumber || null,
      certificationLevel: editCertLevel || null,
      certExpiry: editCertExpiry || null,
      customerOrgId: editCustomerOrgId ? Number(editCustomerOrgId) : null,
    });
  };

  if (!user?.companyId) {
    return (
      <AdminLayout title="Users">
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  const { data: usersList, isLoading } = trpc.user.listUsers.useQuery({
    companyId: user.companyId,
    search: search || undefined,
    role: roleFilter !== 'all' ? (roleFilter as any) : undefined,
    isActive: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default';
      case 'office': return 'secondary';
      case 'technician': return 'outline';
      case 'customer': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <AdminLayout title="Users">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">Manage user accounts, roles, and permissions</p>
          </div>
          <Button onClick={() => setAddUserOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="office">Office</SelectItem>
              <SelectItem value="technician">Technician</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users Table */}
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Cert #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : !usersList || usersList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <UsersIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No users found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Try adjusting your search or filters
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                usersList.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name || 'Unnamed'}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(u.role)}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.certNumber ? (
                        <span className="flex items-center gap-1">
                          <Award className="h-3 w-3 text-amber-500" />
                          {u.certNumber}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'default' : 'secondary'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(u)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {u.id !== user?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDeleteId(u.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add User Dialog */}
        <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                Pre-register a user by email. They'll sign in with Google and be automatically matched to this account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-name">Full Name</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-email">Email Address</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role</Label>
                <Select value={newRole} onValueChange={(v) => { setNewRole(v as typeof newRole); setNewCustomerOrgId(''); }}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="technician">Technician</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newRole === 'customer' && (
                <div className="space-y-2">
                  <Label htmlFor="new-customer-org">Customer Organization</Label>
                  <Select value={newCustomerOrgId} onValueChange={setNewCustomerOrgId}>
                    <SelectTrigger id="new-customer-org">
                      <SelectValue placeholder="Select organization…" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerOrgs?.map((org: any) => (
                        <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">This user will only see data for the selected organization.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddUserOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createUserMutation.mutate({
                  email: newEmail,
                  name: newName,
                  role: newRole,
                  customerOrgId: newCustomerOrgId ? Number(newCustomerOrgId) : null,
                })}
                disabled={createUserMutation.isPending || !newEmail.trim() || !newName.trim()}
              >
                {createUserMutation.isPending ? 'Adding...' : 'Add User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete User Confirm */}
        <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove user?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the user account and remove them from all job assignments.
                Jobs they were assigned to will become unassigned. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => confirmDeleteId && deleteUserMutation.mutate({ userId: confirmDeleteId })}
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? 'Removing…' : 'Remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit User Dialog */}
        <Dialog open={editingUser !== null} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user role, account status, and certification details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Basic info */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="User name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select value={editRole} onValueChange={(v) => { setEditRole(v); if (v !== 'customer') setEditCustomerOrgId(''); }}>
                  <SelectTrigger id="edit-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="technician">Technician</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editRole === 'customer' && (
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-org">Customer Organization</Label>
                  <Select value={editCustomerOrgId} onValueChange={setEditCustomerOrgId}>
                    <SelectTrigger id="edit-customer-org">
                      <SelectValue placeholder="Select organization…" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerOrgs?.map((org: any) => (
                        <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Customer users only see data for their assigned organization.</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-active">Active Status</Label>
                <Switch
                  id="edit-active"
                  checked={editIsActive}
                  onCheckedChange={setEditIsActive}
                />
              </div>

              <Separator />

              {/* Certification section */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-medium">Technician Certification</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Required for ULC S536 compliance — appears on PDF inspection reports.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cert-number">Certification Number</Label>
                <Input
                  id="edit-cert-number"
                  value={editCertNumber}
                  onChange={(e) => setEditCertNumber(e.target.value)}
                  placeholder="e.g. CFAA-12345"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cert-level">Certification Level / Description</Label>
                <Input
                  id="edit-cert-level"
                  value={editCertLevel}
                  onChange={(e) => setEditCertLevel(e.target.value)}
                  placeholder="e.g. Level II Fire Alarm Technician"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cert-expiry">Certification Expiry Date</Label>
                <Input
                  id="edit-cert-expiry"
                  type="date"
                  value={editCertExpiry}
                  onChange={(e) => setEditCertExpiry(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveUser} disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
