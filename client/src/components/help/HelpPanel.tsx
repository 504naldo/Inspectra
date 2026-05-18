import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { FeedbackButton } from "@/components/FeedbackButton";
import { trpc } from "@/lib/trpc";
import {
  Bot,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { type HelpContent } from "@/lib/helpContent";

interface HelpPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  helpContent: HelpContent | null;
  routeKey: string | null;
}

export function HelpPanel({ open, onOpenChange, helpContent, routeKey }: HelpPanelProps) {
  const { user } = useAuth();
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const canUseAI = user?.role === "admin" || user?.role === "office";

  const askAI = trpc.aiAssistant.ask.useMutation({
    onSuccess: (data) => setAiAnswer(data.answer),
    onError: () => setAiError("AI is unavailable right now — try again later."),
  });

  function handleAskAI() {
    if (!helpContent) return;
    setAiAnswer(null);
    setAiError(null);
    askAI.mutate({
      message: `Explain the "${helpContent.title}" page in Inspectra: what it is for, what I should focus on, and what to do next.`,
      mode: "workflow_help",
    });
  }

  function handleClose() {
    setAiAnswer(null);
    setAiError(null);
    onOpenChange(false);
  }

  const roleNote =
    user?.role === "admin" ? helpContent?.roleNotes?.admin :
    user?.role === "office" ? helpContent?.roleNotes?.office :
    user?.role === "technician" ? helpContent?.roleNotes?.technician :
    undefined;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-base">
            {helpContent ? helpContent.title : "Page Help"}
          </SheetTitle>
        </SheetHeader>

        {!helpContent ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            No help content available for this page yet.
          </div>
        ) : (
          <div className="flex-1 px-5 py-4 space-y-5 text-sm">

            {/* Description */}
            <p className="text-muted-foreground leading-relaxed">{helpContent.description}</p>

            {/* Workflow hint */}
            {helpContent.workflowHint && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <p className="text-blue-800 dark:text-blue-300 leading-relaxed">{helpContent.workflowHint}</p>
              </div>
            )}

            {/* Common tasks */}
            {helpContent.commonTasks && helpContent.commonTasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Common tasks</h3>
                <ul className="space-y-1.5">
                  {helpContent.commonTasks.map((task, i) => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground">
                      <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/60" />
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next steps */}
            {helpContent.nextSteps && helpContent.nextSteps.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Next steps</h3>
                <ul className="space-y-1.5">
                  {helpContent.nextSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground">
                      <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {helpContent.warnings && helpContent.warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Reminders</h3>
                <div className="space-y-2">
                  {helpContent.warnings.map((w, i) => (
                    <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-amber-800 dark:text-amber-300 leading-relaxed">{w}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Role note */}
            {roleNote && (
              <div className="rounded-lg border bg-muted/40 p-3 text-muted-foreground leading-relaxed">
                {roleNote}
              </div>
            )}

            {/* Related pages */}
            {helpContent.relatedPages && helpContent.relatedPages.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Related pages</h3>
                <div className="flex flex-wrap gap-2">
                  {helpContent.relatedPages.map((page) => (
                    <Link key={page.href} href={page.href} onClick={handleClose}>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        {page.label}
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Ask AI */}
            {canUseAI && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleAskAI}
                  disabled={askAI.isPending}
                >
                  {askAI.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4 text-primary" />
                  )}
                  {askAI.isPending ? "Asking AI…" : "Ask AI about this page"}
                </Button>

                {aiError && (
                  <p className="text-xs text-destructive">{aiError}</p>
                )}

                {aiAnswer && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {aiAnswer}
                  </div>
                )}
              </div>
            )}

            {/* Feedback */}
            <FeedbackButton
              variant="ghost"
              size="sm"
              label="Report issue with this page"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              entityType={routeKey ?? undefined}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
