import { useState, useRef, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "general" | "summarize" | "deficiency_help" | "report_qa" | "repair_quote" | "invoice" | "compliance" | "workflow_help";
type ContextType = "job" | "site" | "deficiency" | "report" | "repair_quote" | "approved_work" | "invoice";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contextUsed?: string | null;
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

const SUGGESTED_ACTIONS: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Open Jobs", href: "/admin/jobs", icon: ClipboardList },
  { label: "Open Sites", href: "/admin/sites", icon: Building2 },
  { label: "Report QA", href: "/admin/report-qa", icon: FileText },
  { label: "Approved Work", href: "/admin/approved-work", icon: CheckSquare },
  { label: "Invoices", href: "/admin/invoices", icon: ReceiptText },
  { label: "Compliance", href: "/admin/compliance", icon: ShieldAlert },
];

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted text-foreground rounded-tl-sm"
      }`}>
        {msg.content}
        {msg.contextUsed && (
          <span className="block text-xs opacity-60 mt-1">Context: {msg.contextUsed}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIAssistant() {
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = trpc.aiAssistant.ask.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: data.answer,
        contextUsed: data.contextUsed,
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

  const { data: contextSummary } = trpc.aiAssistant.getContextSummary.useQuery(
    { contextType: contextType as ContextType, contextId: parseInt(contextId) },
    { enabled: !!contextType && !!contextId && !isNaN(parseInt(contextId)) }
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Chat cleared. How can I help you?",
    }]);
  };

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

          {/* Context */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context (optional)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Select value={contextType} onValueChange={(v) => setContextType(v as ContextType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Record type…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
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

        {/* ── Chat panel ────────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col min-h-0">

          {/* Chat header */}
          <div className="flex items-center justify-between mb-3">
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
          <div className="flex items-start gap-2 mt-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
            AI suggestions are drafts. Review before saving, sending, or relying on compliance decisions.
          </div>

          {/* Input area */}
          <div className="flex gap-2 mt-2">
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
        </div>
      </div>
    </AdminLayout>
  );
}
