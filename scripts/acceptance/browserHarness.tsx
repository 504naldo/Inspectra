import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { createScopedTrpcClient } from "@/lib/createScopedTrpcClient";
import { AUTH_ME_QUERY_KEY } from "@/lib/accountCache";
import { AccountCacheBoundary } from "@/components/AccountCacheBoundary";
import { FireAlarmChecklist } from "@/components/inspection/FireAlarmChecklist";
import { SmokeAlarmGrid, type SmokeAlarmRow } from "@/components/inspection/SmokeAlarmGrid";
import { IndividualDeviceGrid } from "@/components/inspection/IndividualDeviceGrid";
import InvoiceDetail from "@/pages/admin/InvoiceDetail";
import { fireAlarmDraftKey, pendingFireAlarmDraftCount } from "@/lib/pendingSaves";
import { useAuth } from "@/_core/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/index.css";

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const parameters = new URLSearchParams(location.search);
const mode = parameters.get("mode") ?? "fire";
const initialJob = Number(parameters.get("job") ?? 101);
const initialInvoice = Number(parameters.get("invoice") ?? 501);
const initialDevices = [{ id: 201, deviceRevision: `inspection-capture-v1:device:${"a".repeat(64)}`,
  deviceType: "SA-I", suiteNumber: "Original suite", location: "Original location", result: "not_tested" as const }];

function AcceptanceScreen() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [jobId, setJobId] = useState(initialJob);
  const [invoiceId, setInvoiceId] = useState(initialInvoice);
  const [isFinalized, setFinalized] = useState(false);
  const [devices, setDevices] = useState<SmokeAlarmRow[]>(initialDevices);
  // Controls exist only in this standalone harness. Production components are imported unchanged.
  (window as any).__acceptance = {
    refreshAuth: () => client.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY }),
    setJobId, setInvoiceId, setFinalized, setDevices,
    refreshHeader: () => utils.fireAlarmForm.getHeader.invalidate({ jobId }),
    pendingDraftCount: () => user ? pendingFireAlarmDraftCount(fireAlarmDraftKey(user.id, user.companyId, jobId), localStorage) : 0,
  };
  return <TooltipProvider><div data-testid="identity">{user ? `${user.id}:${user.companyId}:${user.sessionVersion}` : "signed-out"}</div>
    <main data-testid="production-component">
      {mode === "fire" ? <FireAlarmChecklist jobId={jobId} siteId={301} isFinalized={isFinalized} />
        : mode === "invoice" ? <InvoiceDetail id={invoiceId} />
        : mode === "smoke" ? <SmokeAlarmGrid jobId={jobId} siteId={301} companyId={user?.companyId ?? 1}
            devices={devices} isFinalized={isFinalized} />
        : <IndividualDeviceGrid jobId={jobId} siteId={301} companyId={user?.companyId ?? 1}
            devices={devices.map(device => ({ ...device, deviceType: device.deviceType ?? "Smoke Detector" }))}
            isFinalized={isFinalized} />}
    </main><Toaster /></TooltipProvider>;
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={createScopedTrpcClient(null)} queryClient={client}>
    <QueryClientProvider client={client}><AccountCacheBoundary><AcceptanceScreen /></AccountCacheBoundary></QueryClientProvider>
  </trpc.Provider>
);
