import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Bot,
  Send,
  Loader2,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ClipboardCopy,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type AskResult = { answer: string; warnings: string[]; suggestedActions: string[]; contextUsed: string };
type SummaryResult = {
  jobSummary: string; accessNotes: string; importantSiteInfo: string;
  openDeficiencies: string[]; inspectionProgress: string; warnings: string[]; isDraft: boolean; disclaimer: string;
};
type QACheckResult = {
  readyForQA: boolean; missingItems: string[]; untestedDevicesCount: number;
  deficiencyCount: number; criticalWarnings: string[]; suggestedNextSteps: string[];
};

type ActiveResult =
  | { kind: "ask"; data: AskResult }
  | { kind: "summary"; data: SummaryResult }
  | { kind: "qacheck"; data: QACheckResult };

const QUICK_PROMPTS = [
  "What should I know before starting?",
  "Summarize site access notes",
  "What is still incomplete?",
  "Suggest corrective action wording",
];

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={() => { navigator.clipboard?.writeText(text); toast.success("Copied"); }}
    >
      <ClipboardCopy className="h-3.5 w-3.5" />
    </Button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function AskResultView({ data }: { data: AskResult }) {
  return (
    <div className="space-y-3">
      <Section label="Answer">
        <div className="flex gap-2">
          <p className="text-sm flex-1 whitespace-pre-line">{data.answer}</p>
          <CopyButton text={data.answer} />
        </div>
      </Section>
      {data.suggestedActions.length > 0 && (
        <Section label="Suggested Actions">
          <ul className="space-y-1">
            {data.suggestedActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {data.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-1">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryResultView({ data }: { data: SummaryResult }) {
  return (
    <div className="space-y-3">
      {data.jobSummary && (
        <Section label="Job Summary">
          <div className="flex gap-2">
            <p className="text-sm flex-1 whitespace-pre-line">{data.jobSummary}</p>
            <CopyButton text={data.jobSummary} />
          </div>
        </Section>
      )}
      {data.accessNotes && (
        <Section label="Access Notes">
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5 flex gap-2">
            <p className="text-sm flex-1 whitespace-pre-line">{data.accessNotes}</p>
            <CopyButton text={data.accessNotes} />
          </div>
        </Section>
      )}
      {data.importantSiteInfo && (
        <Section label="Site Info">
          <p className="text-sm whitespace-pre-line">{data.importantSiteInfo}</p>
        </Section>
      )}
      {data.inspectionProgress && (
        <Section label="Inspection Progress">
          <p className="text-sm">{data.inspectionProgress}</p>
        </Section>
      )}
      {data.openDeficiencies.length > 0 && (
        <Section label={`Open Deficiencies (${data.openDeficiencies.length})`}>
          <ul className="space-y-1">
            {data.openDeficiencies.map((d, i) => (
              <li key={i} className="text-sm flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" /> {d}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {data.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-1">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground italic">{data.disclaimer}</p>
    </div>
  );
}

function QACheckResultView({ data }: { data: QACheckResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {data.readyForQA ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready for QA
          </Badge>
        ) : (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" /> Not ready
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {data.untestedDevicesCount > 0 ? `${data.untestedDevicesCount} untested · ` : ""}{data.deficiencyCount} open deficiencies
        </span>
      </div>

      {data.missingItems.length > 0 && (
        <Section label="Missing Items">
          <ul className="space-y-1">
            {data.missingItems.map((item, i) => (
              <li key={i} className="text-sm flex items-start gap-1.5 text-destructive">
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.criticalWarnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-1">
          {data.criticalWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}

      {data.suggestedNextSteps.length > 0 && (
        <Section label="Next Steps">
          <ul className="space-y-1.5">
            {data.suggestedNextSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" /> {s}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface FieldCopilotPanelProps {
  jobId: number;
  isOnline: boolean;
  jobStatus?: string;
}

export function FieldCopilotPanel({ jobId, isOnline, jobStatus }: FieldCopilotPanelProps) {
  const [open, setOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [activeResult, setActiveResult] = useState<ActiveResult | null>(null);

  const askCopilot = trpc.aiAssistant.askFieldCopilot.useMutation({
    onSuccess: (data) => setActiveResult({ kind: "ask", data }),
    onError: (err) => toast.error(err.message || "AI unavailable — try again"),
  });

  const summarize = trpc.aiAssistant.summarizeJobForTechnician.useMutation({
    onSuccess: (data) => setActiveResult({ kind: "summary", data }),
    onError: (err) => toast.error(err.message || "AI unavailable — try again"),
  });

  const qaCheck = trpc.aiAssistant.checkBeforeSubmitForQA.useMutation({
    onSuccess: (data) => setActiveResult({ kind: "qacheck", data }),
    onError: (err) => toast.error(err.message || "Check failed"),
  });

  const isLoading = askCopilot.isPending || summarize.isPending || qaCheck.isPending;

  function resetAll() {
    askCopilot.reset();
    summarize.reset();
    qaCheck.reset();
    setActiveResult(null);
  }

  function sendMessage(msg: string) {
    if (!msg.trim()) return;
    resetAll();
    askCopilot.mutate({ jobId, message: msg });
    setInputMessage("");
  }

  function handleSummarize() {
    resetAll();
    summarize.mutate({ jobId });
  }

  function handleQACheck() {
    resetAll();
    qaCheck.mutate({ jobId });
  }

  const showSubmitForQA = jobStatus === "in_progress";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); resetAll(); }}
        className="flex items-center gap-1.5 h-9"
        disabled={!isOnline}
        title={!isOnline ? "AI requires an internet connection" : undefined}
      >
        <Bot className="h-4 w-4" />
        Ask AI
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] flex flex-col rounded-t-xl p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" />
              AI Field Copilot
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {/* Offline banner */}
            {!isOnline && (
              <div className="rounded-lg border border-muted bg-muted/50 p-3 flex items-center gap-2 text-sm text-muted-foreground">
                <WifiOff className="h-4 w-4 shrink-0" />
                AI requires an internet connection. Your normal inspection workflow is still available.
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI is thinking…
              </div>
            )}

            {/* Results */}
            {activeResult && !isLoading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {activeResult.kind === "ask" ? "Answer" : activeResult.kind === "summary" ? "Job Summary" : "Pre-QA Check"}
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetAll}>
                    Back
                  </Button>
                </div>
                {activeResult.kind === "ask" && <AskResultView data={activeResult.data} />}
                {activeResult.kind === "summary" && <SummaryResultView data={activeResult.data} />}
                {activeResult.kind === "qacheck" && <QACheckResultView data={activeResult.data} />}
              </div>
            )}

            {/* Home state */}
            {!activeResult && !isLoading && (
              <div className="space-y-4">
                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-14 flex-col gap-1 text-sm"
                    disabled={!isOnline}
                    onClick={handleSummarize}
                  >
                    <Bot className="h-4 w-4" />
                    Summarize Job
                  </Button>
                  {showSubmitForQA && (
                    <Button
                      variant="outline"
                      className="h-14 flex-col gap-1 text-sm"
                      disabled={!isOnline}
                      onClick={handleQACheck}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Check Before Submit
                    </Button>
                  )}
                </div>

                {/* Quick prompts */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quick Prompts</p>
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      disabled={!isOnline}
                      onClick={() => sendMessage(prompt)}
                      className="w-full text-left text-sm px-3 py-2.5 rounded-lg border border-border hover:bg-accent/50 active:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                    >
                      <span>{prompt}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 border-t shrink-0 space-y-2">
            <p className="text-[10px] text-muted-foreground italic">
              AI suggestions are drafts. Verify before saving or submitting.
            </p>
            <div className="flex gap-2">
              <Textarea
                placeholder={isOnline ? "Ask anything about this job…" : "AI unavailable offline"}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={!isOnline || isLoading}
                rows={2}
                className="resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inputMessage); }
                }}
              />
              <Button
                size="icon"
                className="h-auto self-stretch px-3"
                disabled={!isOnline || isLoading || !inputMessage.trim()}
                onClick={() => sendMessage(inputMessage)}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
