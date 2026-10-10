import { createHash, createHmac, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
export const sourceHash = (source: unknown) =>
  createHash("sha256").update(JSON.stringify(source)).digest("hex");
export type EwfBinding = {
  companyId: number;
  clientId: string;
  url: string;
  key: string;
};
export function ewfBinding(companyId: number): EwfBinding {
  if (process.env.EWF_INTEGRATION_ENABLED !== "true")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Sprinkler Desk integration is not enabled",
    });
  let bindings: EwfBinding[];
  try {
    bindings = JSON.parse(process.env.EWF_INTEGRATION_BINDINGS || "[]");
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Integration configuration requires review",
    });
  }
  const binding = bindings.find(b => b.companyId === companyId);
  if (!binding || typeof binding.key !== "string" || binding.key.length < 32)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No reviewed company integration mapping",
    });
  const url = new URL(binding.url);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Integration requires a reviewed HTTPS origin",
    });
  return binding;
}
export async function ewfCommand(
  binding: EwfBinding,
  actor: { id: number; role: string },
  source: unknown,
  action: string,
  payload: unknown
) {
  if (!["admin", "office", "technician"].includes(actor.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Verified staff identity required",
    });
  const body = {
      actorId: actor.id,
      actorKind: actor.role === "technician" ? "technician" : "office",
      source,
      action,
      payload,
    },
    time = String(Date.now()),
    nonce = randomUUID();
  const signature = createHmac("sha256", binding.key)
    .update(`${time}\n${nonce}\n${JSON.stringify(body)}`)
    .digest("hex");
  let response: Response;
  try {
    response = await fetch(new URL("/api/inspectra/command", binding.url), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        "X-EWF-Request": "1",
        "X-Inspectra-Client": binding.clientId,
        "X-Inspectra-Time": time,
        "X-Inspectra-Nonce": nonce,
        "X-Inspectra-Signature": signature,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TRPCError({
      code: "TIMEOUT",
      message:
        "Sprinkler Desk outcome is uncertain. Reload and reconcile before retrying.",
    });
  }
  const result = await response.json();
  if (!response.ok)
    throw new TRPCError({
      code:
        response.status === 409
          ? "CONFLICT"
          : response.status === 404
            ? "NOT_FOUND"
            : response.status === 403 || response.status === 401
              ? "FORBIDDEN"
              : "BAD_REQUEST",
      message:
        typeof result.error === "string"
          ? result.error
          : "Sprinkler Desk request rejected",
    });
  return result as EwfView;
}
export type EwfEstimate = {
  id: string;
  row_version: number;
  status: string;
  fitter_name: string;
  estimated_hours_hundredths: number | null;
  scope: string;
  restrictions: string;
  notes: string;
  parts: { description: string; quantity_milli: number; unit: string }[];
  review_note?: string;
  writable: boolean;
  reviewable: boolean;
};
export type EwfView = {
  sourceStale: boolean;
  source: {
    version: string;
    property: { name: string; address: string; city: string };
    deficiency: {
      title: string;
      description: string;
      severity: string;
      status: string;
    };
  };
  quoteId: string;
  quoteNumber: string;
  quoteTitle: string;
  quoteDescription: string;
  quoteVersion: number;
  sourceHash: string;
  items: EwfEstimate[];
  fitters: { id: string; display_name: string }[];
};
