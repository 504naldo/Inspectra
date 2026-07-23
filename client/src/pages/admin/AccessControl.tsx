import { useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ROLE_META,
  PERMISSION_MODULES,
  resolvePermission,
  ENFORCED_PERMISSIONS,
  isRoleOverridable,
  type Role,
  type Permission,
  type PermissionOverride,
} from "@/lib/permissions";
import {
  CheckCircle2,
  XCircle,
  Shield,
  ShieldCheck,
  Users,
  ExternalLink,
  AlertTriangle,
  Lock,
  RotateCcw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DISPLAY_ROLES: Role[] = ["admin", "office", "technician", "customer"];

function PermCheck({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
  ) : (
    <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
  );
}

// High-risk permissions that get their own summary section
const HIGH_RISK: { label: string; permission: Permission }[] = [
  { label: "Payroll: review all",    permission: "payroll.review"      },
  { label: "Payroll: approve",       permission: "payroll.approve"     },
  { label: "Payroll: export",        permission: "payroll.export"      },
  { label: "Invoices: export (Sage)",permission: "invoices.export"     },
  { label: "Invoice: create/edit",   permission: "invoices.update"     },
  { label: "Company settings: edit", permission: "settings.manage"     },
  { label: "User management",        permission: "users.manage"        },
  { label: "Access control: manage", permission: "accessControl.manage"},
  { label: "Reports: approve/send",  permission: "reports.approve"     },
  { label: "AI: admin features",     permission: "ai.adminFeatures"    },
  { label: "Knowledge base: manage", permission: "ai.knowledgeManage"  },
  { label: "Job: finalize (lock)",   permission: "jobs.finalize"       },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccessControl() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: usersData, isLoading: usersLoading } = trpc.accessControl.getUsers.useQuery(
    undefined,
    { enabled: isAdmin },
  );
  const logViewed = trpc.accessControl.logViewed.useMutation();

  // Company per-role overrides (admins only). Non-admins keep the read-only,
  // baseline view — overrides stays empty so effective === baseline for them.
  const { data: rolePerms } = trpc.accessControl.getRolePermissions.useQuery(undefined, {
    enabled: isAdmin,
  });
  const utils = trpc.useUtils();
  const setPerm = trpc.accessControl.setRolePermission.useMutation({
    onSuccess: () => utils.accessControl.getRolePermissions.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update permission"),
  });

  const overrides: PermissionOverride[] = rolePerms?.overrides ?? [];
  const enforced = new Set<string>(rolePerms?.enforcedPermissions ?? ENFORCED_PERMISSIONS);
  // Effective (baseline ⊕ this company's overrides). admin is never overridden.
  const eff = (role: Role, perm: Permission) => resolvePermission(role, perm, overrides);
  const isOverridden = (role: Role, perm: Permission) =>
    overrides.some((o) => o.role === role && o.permission === perm);

  useEffect(() => {
    logViewed.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title="Access Control">
      {/* ── Role overview ──────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Role Overview
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ROLE_META.map((meta) => (
            <Card
              key={meta.role}
              className={`border ${!meta.active ? "opacity-60" : ""}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{meta.label}</span>
                  {!meta.active && (
                    <Badge variant="outline" className="text-xs">Inactive</Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">{meta.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
                  {meta.role === "customer" ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {meta.active ? "Active role" : "Portal not active"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── High-risk access summary ───────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          High-Risk Access Summary
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[260px]">Sensitive Operation</TableHead>
                  {DISPLAY_ROLES.map((r) => (
                    <TableHead key={r} className="text-center w-[100px]">
                      {ROLE_META.find((m) => m.role === r)?.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {HIGH_RISK.map(({ label, permission }) => (
                  <TableRow key={permission}>
                    <TableCell className="font-medium text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        {label}
                        {enforced.has(permission) && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label="Enforced" />
                        )}
                      </span>
                    </TableCell>
                    {DISPLAY_ROLES.map((r) => (
                      <TableCell key={r} className="text-center">
                        <PermCheck allowed={eff(r, permission)} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* ── Full permission matrix ─────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          Full Permission Matrix
        </h2>
        {isAdmin ? (
          <div className="mb-3 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              Toggle a permission to customize it for a role in <strong>your company</strong>. The{" "}
              <strong>Admin</strong> role always keeps full access and can't be changed.
              A blue dot marks a permission you've changed from its default — use the reset button to revert.
            </p>
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              Marks permissions that are <strong>enforced on the server</strong> today — toggling these changes what the role can actually do. Other toggles are saved and will take effect as more endpoints adopt them.
            </p>
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">Baseline role permissions (view only).</p>
        )}
        <div className="space-y-4">
          {PERMISSION_MODULES.map((mod) => (
            <Card key={mod.label}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {mod.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4 w-[280px]">Permission</TableHead>
                      {DISPLAY_ROLES.map((r) => (
                        <TableHead key={r} className="text-center w-[110px]">
                          {ROLE_META.find((m) => m.role === r)?.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(mod.permissions).map(([permKey, label]) => {
                      const perm = permKey as Permission;
                      return (
                        <TableRow key={perm}>
                          <TableCell className="pl-4 text-sm">
                            <span className="inline-flex items-center gap-1.5">
                              {label}
                              {enforced.has(perm) && (
                                <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Enforced server-side" />
                              )}
                            </span>
                          </TableCell>
                          {DISPLAY_ROLES.map((r) => {
                            const editable = isAdmin && isRoleOverridable(r);
                            if (!editable) {
                              // Admin column (locked) or non-admin viewer → read-only.
                              return (
                                <TableCell key={r} className="text-center">
                                  <span className="inline-flex items-center justify-center gap-1">
                                    <PermCheck allowed={eff(r, perm)} />
                                    {r === "admin" && <Lock className="h-3 w-3 text-muted-foreground/50" aria-label="Admin is fixed" />}
                                  </span>
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={r} className="text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Switch
                                      checked={eff(r, perm)}
                                      disabled={setPerm.isPending}
                                      onCheckedChange={(v) => setPerm.mutate({ role: r, permission: perm, allowed: v })}
                                      aria-label={`${label} for ${r}`}
                                    />
                                    {isOverridden(r, perm) && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Changed from default" />
                                    )}
                                  </div>
                                  {isOverridden(r, perm) && (
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                                      disabled={setPerm.isPending}
                                      onClick={() => setPerm.mutate({ role: r, permission: perm, allowed: null })}
                                    >
                                      <RotateCcw className="h-2.5 w-2.5" /> reset
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── User role list (admin only) ────────────────────────────────── */}
      {isAdmin && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Users &amp; Roles
            </h2>
            <Link href="/admin/users">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Manage Users
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Loading users…
                      </TableCell>
                    </TableRow>
                  )}
                  {!usersLoading && (!usersData || usersData.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                  {usersData?.map((u) => {
                    const meta = ROLE_META.find((m) => m.role === u.role);
                    const active = u.isActive !== 0;
                    return (
                      <TableRow key={u.id} className={!active ? "opacity-50" : ""}>
                        <TableCell className="pl-4 font-medium">
                          {u.name ?? <span className="text-muted-foreground italic">No name</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.email ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta?.color ?? "bg-muted text-muted-foreground border-border"}`}>
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {active ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground mt-2">
            To change a user's role, use the{" "}
            <Link href="/admin/users" className="underline underline-offset-2">
              Users
            </Link>{" "}
            page.
          </p>
        </section>
      )}

      {!isAdmin && (
        <section className="mb-4">
          <div className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            User list visible to admins only.
          </div>
        </section>
      )}

      <Separator className="my-6" />

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Role-based access is enforced on both frontend routes and backend API procedures.
          Hiding a nav item is cosmetic — backend procedures independently reject unauthorized requests.
        </p>
        <p>
          Per-role permission overrides are scoped to your company and never affect other companies.
          The Admin role is the platform operator and always retains full access.
        </p>
        <p>
          Customer portal is not active. Customer-role users are redirected to the home page.
        </p>
      </div>
    </AdminLayout>
  );
}
