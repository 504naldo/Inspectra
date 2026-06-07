import { useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ROLE_META,
  PERMISSION_MODULES,
  hasPermission,
  type Role,
  type Permission,
} from "@/lib/permissions";
import {
  CheckCircle2,
  XCircle,
  Shield,
  Users,
  ExternalLink,
  AlertTriangle,
  Lock,
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
                    <TableCell className="font-medium text-sm">{label}</TableCell>
                    {DISPLAY_ROLES.map((r) => (
                      <TableCell key={r} className="text-center">
                        <PermCheck allowed={hasPermission({ role: r }, permission)} />
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
                        <TableHead key={r} className="text-center w-[90px]">
                          {ROLE_META.find((m) => m.role === r)?.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(mod.permissions).map(([perm, label]) => (
                      <TableRow key={perm}>
                        <TableCell className="pl-4 text-sm">{label}</TableCell>
                        {DISPLAY_ROLES.map((r) => (
                          <TableCell key={r} className="text-center">
                            <PermCheck
                              allowed={hasPermission(
                                { role: r },
                                perm as Permission,
                              )}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta?.color ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
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
          Customer portal is not active. Customer-role users are redirected to the home page.
        </p>
      </div>
    </AdminLayout>
  );
}
