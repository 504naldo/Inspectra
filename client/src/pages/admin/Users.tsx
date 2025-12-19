import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { 
  Search, 
  Users as UsersIcon,
  Shield,
  User,
  Briefcase,
  Building2
} from "lucide-react";

export default function AdminUsers() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  // Note: In a real app, you'd have a users list endpoint
  // For now, we show a placeholder

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="h-4 w-4 text-primary" />;
      case 'office': return <Briefcase className="h-4 w-4 text-blue-500" />;
      case 'technician': return <User className="h-4 w-4 text-green-500" />;
      case 'customer': return <Building2 className="h-4 w-4 text-amber-500" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-primary/10 text-primary';
      case 'office': return 'bg-blue-100 text-blue-700';
      case 'technician': return 'bg-green-100 text-green-700';
      case 'customer': return 'bg-amber-100 text-amber-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <AdminLayout title="Users">
      <div className="space-y-6">
        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Role Legend */}
        <Card>
          <CardHeader>
            <CardTitle>User Roles</CardTitle>
            <CardDescription>Understanding the different access levels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Admin</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Full access to all features, user management, and system settings
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="h-5 w-5 text-blue-500" />
                  <span className="font-semibold">Office</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Job management, scheduling, reporting, and customer communication
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-green-500" />
                  <span className="font-semibold">Technician</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Field inspections, device testing, deficiency reporting
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-5 w-5 text-amber-500" />
                  <span className="font-semibold">Customer</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  View reports, track deficiencies, approve inspections
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current User */}
        <Card>
          <CardHeader>
            <CardTitle>Current User</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 border rounded-lg">
              <div className="p-3 bg-primary/10 rounded-full">
                {getRoleIcon(user?.role || 'user')}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{user?.name || 'Unknown User'}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeClass(user?.role || 'user')}`}>
                {user?.role || 'user'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="bg-muted/50">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <UsersIcon className="h-8 w-8 text-muted-foreground" />
              <div>
                <h3 className="font-semibold mb-1">User Management</h3>
                <p className="text-sm text-muted-foreground">
                  To manage users and assign roles, use the database management panel. 
                  Users are automatically created when they first log in via OAuth. 
                  You can then update their role in the database to grant appropriate access levels.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
