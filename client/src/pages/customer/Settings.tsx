import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bell } from "lucide-react";

export default function CustomerSettings() {
  const utils = trpc.useUtils();

  const { data: prefs, isLoading } = trpc.customerOrg.getNotifPrefs.useQuery();

  const updatePrefs = trpc.customerOrg.updateNotifPrefs.useMutation({
    onSuccess: () => {
      toast.success("Preferences saved");
      utils.customerOrg.getNotifPrefs.invalidate();
    },
    onError: () => toast.error("Failed to save preferences"),
  });

  function toggle(key: "notifyReportReady" | "notifyJobScheduled", value: boolean) {
    if (!prefs) return;
    updatePrefs.mutate({
      notifyReportReady: key === "notifyReportReady" ? value : prefs.notifyReportReady,
      notifyJobScheduled: key === "notifyJobScheduled" ? value : prefs.notifyJobScheduled,
    });
  }

  return (
    <CustomerLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your notification preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Email Notifications
            </CardTitle>
            <CardDescription>
              Choose which emails you receive at your organization's contact address.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="notif-report" className="text-sm font-medium">
                      Report ready
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Get notified when a new inspection report is available for your review.
                    </p>
                  </div>
                  <Switch
                    id="notif-report"
                    checked={prefs?.notifyReportReady ?? true}
                    disabled={updatePrefs.isPending}
                    onCheckedChange={(v) => toggle("notifyReportReady", v)}
                  />
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="notif-job" className="text-sm font-medium">
                      Inspection scheduled
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Get notified when an inspection is booked at one of your sites.
                    </p>
                  </div>
                  <Switch
                    id="notif-job"
                    checked={prefs?.notifyJobScheduled ?? true}
                    disabled={updatePrefs.isPending}
                    onCheckedChange={(v) => toggle("notifyJobScheduled", v)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
