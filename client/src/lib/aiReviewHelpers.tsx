import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, XCircle } from "lucide-react";

export type AiReviewFinding = {
  severity: "info" | "warning" | "blocker";
  category: string;
  issue: string;
};

export type AiReviewResult = {
  reviewId: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  findings: AiReviewFinding[];
  suggestedQaNote: string | null;
  suggestedActions: string[];
  missingDataWarnings: string[];
};

export function riskBadge(level: string) {
  const cls =
    level === "critical" ? "bg-red-100 text-red-700 border-red-300" :
    level === "high"     ? "bg-orange-100 text-orange-700 border-orange-300" :
    level === "medium"   ? "bg-amber-100 text-amber-700 border-amber-300" :
                           "bg-green-100 text-green-700 border-green-300";
  return <Badge className={`${cls} text-xs capitalize`}>{level} risk</Badge>;
}

export function findingSeverityClass(severity: string): string {
  if (severity === "blocker") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export function FindingIcon({ severity }: { severity: string }) {
  if (severity === "blocker") return <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />;
  if (severity === "warning") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />;
  return <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />;
}
