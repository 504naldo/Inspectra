import { useState, useRef, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  ClipboardList,
  Building2,
  FileText,
  CheckSquare,
  ReceiptText,
  ShieldAlert,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  ChevronRight,
  ClipboardCopy,
  RefreshCw,
} from "lucide-react";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "general" | "summarize" | "deficiency_help" | "report_qa" | "repair_quote" | "invoice" | "compliance" | "workflow_help";
type ContextType = "job" | "site" | "deficiency" | "report" | "repair_quote" | "approved_work" | "invoice";
type CopilotMode = "daily_briefing" | "follow_up" | "compliance" | "reports" | "invoices" | "approved_work" | "scheduling" | "data_quality" | "customer_message" | "workflow_help";
type FollowUpEntityType = "job" | "site" | "deficiency" | "repair_quote" | "invoice" | "approved_work";
type FollowUpPurpose = "report_ready" | "quote_followup" | "invoice_reminder" | "deficiency_followup" | "approved_work_scheduling" | "compliance_notice";

type KbSnippet = { id: number; title: string; category: string; systemType: string | null };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contextUsed?: string | null;
  knowledgeUsed?: KbSnippet[];
};

type CopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedActions?: string[];
  relatedRecords?: { type: string; label: string; href: string }[];
  warnings?: string[];
};

type BriefingResult = {
  summary: string;
  topPriorities: string[];
  risks: string[];
  suggestedActions: string[];
  relatedLinks: { label: string; href: string; reason: string }[];
};

type FollowUpResult = {
  subject: string;
  body: string;
  warnings: string[];
  isDraft: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "general", label: "General" },
  { value: "summarize", label: "Summarize Record" },
  { value: "deficiency_help", label: "Deficiency Help" },
  { value: "report_qa", label: "Report QA" },
  { value: "repair_quote", label: "Repair Quote" },
  { value: "invoice", label: "Invoice" },
  { value: "compliance", label: "Compliance" },
  { value: "workflow_help", label: "Workflow Help" },
];

const CONTEXT_TYPE_OPTIONS: { value: ContextType; label: string }[] = [
  { value: "job", label: "Job" },
  { value: "site", label: "Site" },
  { value: "deficiency", label: "Deficiency" },
  { value: "report", label: "Report" },
  { value: "repair_quote", label: "Repair Quote" },
  { value: "approved_work", label: "Approved Work" },
  { value: "invoice", label: "Invoice" },
];

const QUICK_PROMPTS: { label: string; message: string; mode: Mode }[] = [
  { label: "Today's urgent work", message: "What urgent jobs or critical deficiencies should office staff follow up on today?", mode: "general" },
  { label: "Sites at risk", message: "Which sites are most at risk and why? What should we prioritize?", mode: "compliance" },
  { label: "Report QA summary", message: "What common issues come up in report QA and what should I check before approving a report?", mode: "report_qa" },
  { label: "Workflow: approved work", message: "Walk me through the approved work workflow from quote to close-out.", mode: "workflow_help" },
  { label: "Deficiency severity guide", message: "When should a fire protection deficiency be rated critical vs major vs minor?", mode: "deficiency_help" },
  { label: "Invoice check", message: "What should I verify before sending an invoice to a customer?", mode: "invoice" },
];

const COPILOT_QUICK_PROMPTS: { label: string; message: string; mode: CopilotMode }[] = [
  { label: "What needs attention today?", message: "What should I prioritize today? Summarize the most urgent items needing attention.", mode: "daily_briefing" },
  { label: "Show overdue items", message: "What items are overdue or past their scheduled date? List them.", mode: "daily_briefing" },
  { label: "Invoice export queue", message: "How many invoices are ready for Sage export and what should I check before exporting?", mode: "invoices" },
  { label: "Report QA queue", message: "How many reports are pending QA review? What's the current state?", mode: "reports" },
  { label: "Compliance risks", message: "What compliance risks should I be aware of right now?", mode: "compliance" },
  { label: "Approved work status", message: "What approved work is waiting to be scheduled or is currently in progress?", mode: "approved_work" },
];

const SUGGESTED_ACTIONS: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Open Jobs", href: "/admin/jobs", icon: ClipboardList },
  { label: "Open Sites", href: "/admin/sites", icon: Building2 },
  { label: "Report QA", href: "/admin/report-qa", icon: FileText },
  { label: "Approved Work", href: "/admin/approved-work", icon: CheckSquare },
  { label: "Invoices", href: "/admin/invoices", icon: ReceiptText },
  { label: "Compliance", href: "/admin/compliance", icon: ShieldAlert },
  { label: "Knowledge Base", href: "/admin/knowledge-base", icon: BookOpen },
];

const FOLLOW_UP_ENTITY_TYPES: { value: FollowUpEntityType; label: string }[] = [
  { value: "job", label: "Job" },
  { value: "site", label: "Site" },
  { value: "deficiency", label: "Deficiency" },
  { value: "repair_quote", label: "Repair Quote" },
  { value: "invoice", label: "Invoice" },
  { value: "approved_work", label: "Approved Work" },
];

const FOLLOW_UP_PURPOSES: { value: FollowUpPurpose; label: string }[] = [
  { value: "report_ready", label: "Report Ready" },
  { value: "quote_followup", label: "Quote Follow-Up" },
  { value: "invoice_reminder", label: "Invoice Reminder" },
  { value: "deficiency_followup", label: "Deficiency Follow-Up" },
  { value: "approved_work_scheduling", label: "Schedule Work" },
  { value: "compliance_notice", label: "Compliance Notice" },
];

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const [kbExpanded, setKbExpanded] = useState(false);
  const hasKb = !isUser && msg.knowledgeUsed && msg.knowledgeUsed.length > 0;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="max-w-[80%] space-y-1">
        <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        }`}>
          {msg.content}
          {msg.contextUsed && (
            <span className="block text-xs opacity-60 mt-1">Context: {msg.contextUsed}</span>
          )}
        </div>
        {hasKb && (
          <button
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            onClick={() => setKbExpanded(v => !v)}
          >
            <BookOpen className="h-3 w-3" />
            {msg.knowledgeUsed!.length} knowledge item{msg.knowledgeUsed!.length !== 1 ? "s" : ""} used
            {kbExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
        {hasKb && kbExpanded && (
          <div className="space-y-1">
            {msg.knowledgeUsed!.map(k => (
              <div key={k.id} className="rounded-lg border bg-background px-3 py-1.5 text-xs flex items-center gap-2">
                <BookOpen className="h-3 w-3 text-primary shrink-0" />
                <span className="font-medium truncate">{k.title}</span>
                <span className="text-muted-foreground shrink-0">{k.category}</span>
                {k.systemType && <span className="text-muted-foreground shrink-0">· {k.systemType}</span>}
              </div>
            ))}
            <Link href="/admin/knowledge-base">
              <span className="text-[11px] text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Manage Knowledge Base
              </span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIAssistant() {
  // Chat tab state
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm the Inspectra AI assistant. I can help you summarize records, draft text, review compliance status, and answer questions about the workflow.\n\nTry a quick prompt below, or type your question.",
    },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("general");
  const [contextType, setContextType] = useState<ContextType | "">("");
  const [contextId, setContextId] = useState("");
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Copilot tab state
  const [briefingResult, setBriefingResult] = useState<BriefingResult | null>(null);
  const [briefingTimeframe, setBriefingTimeframe] = useState<"today" | "week" | "overdue" | "all">("today");
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState("");
  const copilotBottomRef = useRef<HTMLDivElement>(null);
  const [followUpEntityType, setFollowUpEntityType] = useState<FollowUpEntityType>("job");
  const [followUpEntityId, setFollowUpEntityId] = useState("");
  const [followUpPurpose, setFollowUpPurpose] = useState<FollowUpPurpose>("report_ready");
  const [followUpResult, setFollowUpResult] = useState<FollowUpResult | null>(null);

  // Chat mutations
  const ask = trpc.aiAssistant.ask.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: data.answer,
        contextUsed: data.contextUsed,
        knowledgeUsed: data.knowledgeUsed ?? [],
      }]);
    },
    onError: (err) => {
      toast.error(err.message || "AI request failed");
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "I ran into an error processing that request. Please try again.",
      }]);
    },
  });

  // Copilot mutations
  const adminBriefing = trpc.aiAssistant.getAdminBriefing.useMutation({
    onSuccess: (data) => setBriefingResult(data),
    onError: (err) => toast.error(err.message || "Briefing failed. Check your AI key settings."),
  });

  const adminCopilot = trpc.aiAssistant.askAdminCopilot.useMutation({
    onSuccess: (data) => {
      setCopilotMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: data.answer,
        suggestedActions: data.suggestedActions,
        relatedRecords: data.relatedRecords,
        warnings: data.warnings,
      }]);
    },
    onError: (err) => {
      toast.error(err.message || "Copilot request failed");
      setCopilotMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "I ran into an error. Please try again.",
      }]);
    },
  });

  const followUp = trpc.aiAssistant.draftCustomerFollowUp.useMutation({
    onSuccess: (data) => setFollowUpResult(data),
    onError: (err) => toast.error(err.message || "Draft failed"),
  });

  const { data: contextSummary } = trpc.aiAssistant.getContextSummary.useQuery(
    { contextType: contextType as ContextType, contextId: parseInt(contextId) },
    { enabled: !!contextType && !!contextId && !isNaN(parseInt(contextId)) }
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    copilotBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [copilotMessages]);

  const sendMessage = (text?: string, overrideMode?: Mode) => {
    const msg = text ?? input.trim();
    if (!msg) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    ask.mutate({
      message: msg,
      mode: overrideMode ?? mode,
      contextType: (contextType as ContextType) || undefined,
      contextId: contextId && !isNaN(parseInt(contextId)) ? parseInt(contextId) : undefined,
      useKnowledgeBase,
    });
  };

  const sendCopilotMessage = (text?: string, overrideMode?: CopilotMode) => {
    const msg = text ?? copilotInput.trim();
    if (!msg) return;
    setCopilotMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: msg }]);
    setCopilotInput("");
    adminCopilot.mutate({ message: msg, mode: overrideMode });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCopilotKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCopilotMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Chat cleared. How can I help you?",
    }]);
  };

  const disclaimerBanner = (
    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
      AI suggestions are drafts. Review before saving, sending, or relying on compliance decisions.
    </div>
  );

  return (
    <AdminLayout title="AI Assistant">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-10rem)]">

        {/* ── Left sidebar ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4 overflow-y-auto">

          {/* Mode */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Knowledge Base toggle */}
          <Card>
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">Use Knowledge Base</span>
                </div>
                <button
                  onClick={() => setUseKnowledgeBase(v => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    useKnowledgeBase ? "bg-primary" : "bg-input"
                  }`}
                  role="switch"
                  aria-checked={useKnowledgeBase}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow-lg transition-transform ${
                    useKnowledgeBase ? "translate-x-4" : "translate-x-0"
                  }`} />
                </button>
              </div>
              {useKnowledgeBase && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  AI will reference your Knowledge Base when answering.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Context */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context (optional)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Select value={contextType || "_none"} onValueChange={(v) => setContextType(v === "_none" ? "" : v as ContextType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Record type…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {CONTEXT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {contextType && (
                <Input
                  placeholder="Record ID…"
                  value={contextId}
                  onChange={e => setContextId(e.target.value)}
                  className="h-8 text-sm"
                  type="number"
                />
              )}
              {contextSummary && (
                <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  {contextSummary.summary.slice(0, 300)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick prompts */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Quick prompts
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.label}
                  className="w-full text-left text-xs rounded-md border px-2.5 py-1.5 hover:bg-accent transition-colors"
                  onClick={() => sendMessage(p.message, p.mode)}
                  disabled={ask.isPending}
                >
                  {p.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Suggested actions */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick links</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1">
              {SUGGESTED_ACTIONS.map(a => {
                const Icon = a.icon;
                return (
                  <Link key={a.href} href={a.href}>
                    <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {a.label}
                      <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
                    </Button>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* ── Right panel (Chat + Copilot tabs) ─────────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <Tabs defaultValue="chat" className="flex flex-col flex-1 min-h-0">
            <TabsList className="w-fit shrink-0">
              <TabsTrigger value="chat" className="gap-1.5 text-sm">
                <Bot className="h-3.5 w-3.5" /> Chat
              </TabsTrigger>
              <TabsTrigger value="copilot" className="gap-1.5 text-sm">
                <BrainCircuit className="h-3.5 w-3.5" /> Admin Copilot
              </TabsTrigger>
            </TabsList>

            {/* ── Chat tab ──────────────────────────────────────────────────── */}
            <TabsContent value="chat" className="flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">

              {/* Chat header */}
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Inspectra AI</span>
                  <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    {MODE_OPTIONS.find(m => m.value === mode)?.label}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={clearChat} className="h-7 text-xs gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 border rounded-xl bg-background p-4 min-h-0">
                {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                {ask.isPending && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Disclaimer */}
              <div className="mt-2 shrink-0">{disclaimerBanner}</div>

              {/* Input area */}
              <div className="flex gap-2 mt-2 shrink-0">
                <Textarea
                  placeholder="Ask anything about your jobs, sites, compliance, or workflow… (Enter to send)"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="resize-none text-sm"
                  disabled={ask.isPending}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={ask.isPending || !input.trim()}
                  size="icon"
                  className="self-end h-10 w-10 shrink-0"
                >
                  {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </TabsContent>

            {/* ── Admin Copilot tab ──────────────────────────────────────────── */}
            <TabsContent value="copilot" className="flex-1 overflow-y-auto space-y-4 pb-4 data-[state=inactive]:hidden">

              {/* Daily Briefing */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-primary" /> Daily Briefing
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={briefingTimeframe} onValueChange={(v) => setBriefingTimeframe(v as typeof briefingTimeframe)}>
                        <SelectTrigger className="h-7 text-xs w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="week">This Week</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                          <SelectItem value="all">All Items</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => adminBriefing.mutate({ timeframe: briefingTimeframe })}
                        disabled={adminBriefing.isPending}
                      >
                        {adminBriefing.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                        }
                        Generate
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {adminBriefing.isPending && (
                  <CardContent className="px-4 pb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating briefing…
                    </div>
                  </CardContent>
                )}
                {briefingResult && !adminBriefing.isPending && (
                  <CardContent className="px-4 pb-4 space-y-3">
                    <p className="text-sm text-foreground">{briefingResult.summary}</p>

                    {briefingResult.topPriorities.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Top Priorities</div>
                        <ul className="space-y-1">
                          {briefingResult.topPriorities.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {briefingResult.risks.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Risks</div>
                        <ul className="space-y-1">
                          {briefingResult.risks.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {briefingResult.suggestedActions.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Suggested Actions</div>
                        <ul className="space-y-1">
                          {briefingResult.suggestedActions.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {briefingResult.relatedLinks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {briefingResult.relatedLinks.map((l, i) => (
                          <Link key={i} href={l.href}>
                            <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-accent" title={l.reason}>
                              <ExternalLink className="h-3 w-3" /> {l.label}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Ask Copilot */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Ask the Copilot
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {/* Quick prompts grid */}
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {COPILOT_QUICK_PROMPTS.map(p => (
                      <button
                        key={p.label}
                        className="text-left text-xs rounded-md border px-2.5 py-2 hover:bg-accent transition-colors"
                        onClick={() => sendCopilotMessage(p.message, p.mode)}
                        disabled={adminCopilot.isPending}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Copilot messages */}
                  {(copilotMessages.length > 0 || adminCopilot.isPending) && (
                    <div className="border rounded-lg p-3 space-y-3 mb-3 max-h-72 overflow-y-auto">
                      {copilotMessages.map(msg => (
                        <div key={msg.id}>
                          {msg.role === "user" ? (
                            <div className="flex gap-2 flex-row-reverse">
                              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <User className="h-3.5 w-3.5 text-primary-foreground" />
                              </div>
                              <div className="bg-primary/10 rounded-xl px-3 py-2 text-sm max-w-[80%]">{msg.content}</div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <BrainCircuit className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="bg-muted rounded-xl px-3 py-2 text-sm whitespace-pre-wrap">{msg.content}</div>
                                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                                  <div className="space-y-1">
                                    {msg.suggestedActions.map((a, i) => (
                                      <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                        <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                                        {a}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {msg.relatedRecords && msg.relatedRecords.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {msg.relatedRecords.map((r, i) => (
                                      <Link key={i} href={r.href}>
                                        <Badge variant="outline" className="text-[11px] gap-1 cursor-pointer hover:bg-accent">
                                          <ExternalLink className="h-2.5 w-2.5" /> {r.label}
                                        </Badge>
                                      </Link>
                                    ))}
                                  </div>
                                )}
                                {msg.warnings && msg.warnings.length > 0 && (
                                  <div className="text-xs text-amber-600 space-y-0.5">
                                    {msg.warnings.map((w, i) => (
                                      <div key={i} className="flex items-start gap-1">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                        {w}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {adminCopilot.isPending && (
                        <div className="flex gap-2">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <BrainCircuit className="h-3.5 w-3.5" />
                          </div>
                          <div className="bg-muted rounded-xl px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                          </div>
                        </div>
                      )}
                      <div ref={copilotBottomRef} />
                    </div>
                  )}

                  {/* Input */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Ask about operations, invoices, compliance, scheduling… (Enter to send)"
                      value={copilotInput}
                      onChange={e => setCopilotInput(e.target.value)}
                      onKeyDown={handleCopilotKeyDown}
                      rows={2}
                      className="resize-none text-sm"
                      disabled={adminCopilot.isPending}
                    />
                    <Button
                      onClick={() => sendCopilotMessage()}
                      disabled={adminCopilot.isPending || !copilotInput.trim()}
                      size="icon"
                      className="self-end h-10 w-10 shrink-0"
                    >
                      {adminCopilot.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Draft Customer Follow-Up */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> Draft Customer Follow-Up
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      value={followUpEntityType}
                      onValueChange={(v) => { setFollowUpEntityType(v as FollowUpEntityType); setFollowUpResult(null); }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Record type" />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLLOW_UP_ENTITY_TYPES.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Record ID"
                      value={followUpEntityId}
                      onChange={e => { setFollowUpEntityId(e.target.value); setFollowUpResult(null); }}
                      className="h-8 text-xs"
                      type="number"
                    />
                    <Select
                      value={followUpPurpose}
                      onValueChange={(v) => { setFollowUpPurpose(v as FollowUpPurpose); setFollowUpResult(null); }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Purpose" />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLLOW_UP_PURPOSES.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => followUp.mutate({
                      entityType: followUpEntityType,
                      entityId: parseInt(followUpEntityId),
                      purpose: followUpPurpose,
                    })}
                    disabled={!followUpEntityId || isNaN(parseInt(followUpEntityId)) || followUp.isPending}
                  >
                    {followUp.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Sparkles className="h-3.5 w-3.5" />
                    }
                    Generate Draft
                  </Button>

                  {followUpResult && (
                    <div className="space-y-2">
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subject</div>
                        <div className="text-sm font-medium">{followUpResult.subject}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Email Body (Draft)</div>
                          <button
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => {
                              navigator.clipboard.writeText(followUpResult.body);
                              toast.success("Copied to clipboard");
                            }}
                            title="Copy body"
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-xs whitespace-pre-wrap text-foreground">{followUpResult.body}</div>
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {followUpResult.warnings[0]}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Disclaimer */}
              {disclaimerBanner}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
}
