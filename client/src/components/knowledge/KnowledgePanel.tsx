import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";

const DOCUMENT_TYPES = [
  { value: "inspection_report", label: "Inspection Report" },
  { value: "equipment_manual", label: "Equipment Manual" },
  { value: "code_document", label: "Code / Standard" },
  { value: "company_procedure", label: "Company Procedure" },
  { value: "voice_note", label: "Voice Note" },
  { value: "other", label: "Other" },
] as const;

const AUDIO_ACCEPT = ".mp3,.mpga,.m4a,.wav,.webm,.ogg,audio/*";
const PDF_ACCEPT = "application/pdf,.pdf";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  reviewed: "bg-blue-100 text-blue-800",
  verified: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  stale: "bg-gray-200 text-gray-600",
};

const SOURCE_LABELS: Record<string, string> = {
  manufacturer_doc: "Manufacturer doc",
  code_requirement: "Code requirement",
  company_procedure: "Company procedure",
  technician_observation: "Technician observation",
  ai_inference: "AI inference",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((d) => [d.value, d.label]),
);

const EXTRACTION_STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  extracting: "bg-blue-100 text-blue-800",
  classifying: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface KnowledgePanelProps {
  pageId: number;
  /** Present for site pages; omitted for equipment-model pages. */
  siteId?: number;
  /** Default document type for the upload dialog (e.g. equipment pages default to manuals). */
  defaultDocumentType?: (typeof DOCUMENT_TYPES)[number]["value"];
  /** Placeholder shown in the Q&A box. */
  questionPlaceholder?: string;
}

/**
 * Shared review surface for a knowledge page: source-cited Q&A, the draft/
 * verified fact list with verify/reject/append-only-edit controls, and a PDF
 * upload that runs the ingestion pipeline. Works for any subject (site or
 * equipment model) — the only difference is whether siteId is passed through.
 */
export default function KnowledgePanel({
  pageId,
  siteId,
  defaultDocumentType = "inspection_report",
  questionPlaceholder = "e.g. What equipment is installed here?",
}: KnowledgePanelProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>(defaultDocumentType);
  const isVoiceNote = documentType === "voice_note";
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    answer: string;
    citedFacts: Array<{ id: number; content: string; status: string; sourceType: string; potentiallyOutdated: boolean }>;
    disclaimer: string;
  } | null>(null);
  const [editingFactId, setEditingFactId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: facts, refetch: refetchFacts } = trpc.knowledgeFact.listForPage.useQuery({ pageId });
  const { data: sourceDocs, refetch: refetchSourceDocs } = trpc.knowledgeIngestion.listSourceDocuments.useQuery({ pageId });

  const ingest = trpc.knowledgeIngestion.ingestDocument.useMutation({
    onSuccess: (res) => {
      toast.success(`Ingested — ${res.factsCreated} draft fact(s) created for review`);
      setUploadOpen(false);
      setPendingFile(null);
      refetchFacts();
      refetchSourceDocs();
    },
    onError: (e) => toast.error(`Ingest failed: ${e.message}`),
  });
  const markReviewed = trpc.knowledgeFact.markReviewed.useMutation({
    onSuccess: () => { refetchFacts(); toast.success("Marked reviewed"); },
    onError: (e) => toast.error(e.message),
  });
  const approve = trpc.knowledgeFact.approve.useMutation({
    onSuccess: () => { refetchFacts(); toast.success("Verified"); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.knowledgeFact.reject.useMutation({
    onSuccess: () => { refetchFacts(); toast.success("Rejected"); },
    onError: (e) => toast.error(e.message),
  });
  const editFact = trpc.knowledgeFact.edit.useMutation({
    onSuccess: () => { refetchFacts(); setEditingFactId(null); toast.success("New version created (draft)"); },
    onError: (e) => toast.error(e.message),
  });
  const markStale = trpc.knowledgeFact.markStale.useMutation({
    onSuccess: () => { refetchFacts(); toast.success("Marked stale"); },
    onError: (e) => toast.error(e.message),
  });
  const ask = trpc.knowledgeQA.ask.useMutation({
    onSuccess: (res) => setAnswer(res),
    onError: (e) => toast.error(e.message),
  });

  async function handleIngest() {
    if (!pendingFile) return;
    const dataUrl = await fileToBase64(pendingFile);
    ingest.mutate({
      pageId,
      ...(siteId ? { siteId } : {}),
      documentType: documentType as (typeof DOCUMENT_TYPES)[number]["value"],
      fileName: pendingFile.name,
      fileDataBase64: dataUrl,
    });
  }

  const activeFacts = (facts ?? []).filter((f) => f.status !== "stale");
  const draftCount = activeFacts.filter((f) => f.status === "draft" || f.status === "reviewed").length;
  const verifiedCount = activeFacts.filter((f) => f.status === "verified").length;

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          <Badge variant="secondary">{verifiedCount} verified</Badge>
          <Badge variant="secondary">{draftCount} awaiting review</Badge>
        </div>
        <Button onClick={() => setUploadOpen(true)}>Upload source document</Button>
      </div>

      {/* Q&A */}
      <Card>
        <CardHeader>
          <CardTitle>Ask a question</CardTitle>
          <CardDescription>Answers are grounded only in stored facts and cite their sources.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={question}
              placeholder={questionPlaceholder}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && question.trim()) ask.mutate({ pageId, question }); }}
            />
            <Button
              disabled={ask.isPending || !question.trim()}
              onClick={() => ask.mutate({ pageId, question })}
            >
              Ask
            </Button>
          </div>
          {answer && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="whitespace-pre-wrap text-sm">{answer.answer}</p>
              {answer.citedFacts.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Sources:</p>
                  {answer.citedFacts.map((c) => (
                    <div key={c.id} className="text-xs flex items-start gap-2">
                      <Badge className={STATUS_STYLES[c.status]}>{c.status}</Badge>
                      <span className="text-muted-foreground">{SOURCE_LABELS[c.sourceType] ?? c.sourceType}:</span>
                      <span>{c.content}</span>
                      {c.potentiallyOutdated && (
                        <Badge className="bg-orange-100 text-orange-800">May be outdated</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground italic">{answer.disclaimer}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source documents */}
      <Card>
        <CardHeader>
          <CardTitle>Source documents</CardTitle>
          <CardDescription>Upload history for this page. Originals are stored as-is and never modified.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(sourceDocs ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          )}
          {(sourceDocs ?? []).map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 text-sm border-b pb-2 last:border-b-0 last:pb-0">
              <div className="space-y-0.5">
                {d.fileUrl ? (
                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{d.title}</a>
                ) : (
                  <span className="font-medium">{d.title}</span>
                )}
                <div className="text-xs text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType} · {formatDate(d.createdAt)}
                  {d.extractionStatus === "failed" && d.errorMessage && <> · {d.errorMessage}</>}
                </div>
              </div>
              <Badge className={EXTRACTION_STATUS_STYLES[d.extractionStatus]}>{d.extractionStatus}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Facts */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge facts</CardTitle>
          <CardDescription>Review AI-extracted facts. Verify accurate ones; reject the rest. Originals are never overwritten.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeFacts.length === 0 && (
            <p className="text-sm text-muted-foreground">No facts yet. Upload a source document to extract some.</p>
          )}
          {activeFacts.map((f) => (
            <div key={f.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm">{f.content}</p>
                <Badge className={STATUS_STYLES[f.status]}>{f.status}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{SOURCE_LABELS[f.sourceType] ?? f.sourceType}</span>
                {f.generatedByAi && <Badge variant="outline">AI</Badge>}
                {f.confidence && <span>· confidence: {f.confidence}</span>}
                {f.potentiallyOutdated && (
                  <Badge className="bg-orange-100 text-orange-800">May be outdated — review</Badge>
                )}
              </div>
              {f.citations.length > 0 && (
                <div className="text-xs text-muted-foreground border-l-2 pl-2 space-y-1">
                  {f.citations.map((c) => (
                    <div key={c.id}>
                      <span className="italic">“{c.excerpt}”</span>
                      {c.locationRef && <span> — {c.locationRef}</span>}
                    </div>
                  ))}
                </div>
              )}
              {(f.status === "draft" || f.status === "reviewed") && (
                <div className="flex gap-2 pt-1">
                  {f.status === "draft" && (
                    <Button size="sm" variant="outline" disabled={markReviewed.isPending} onClick={() => markReviewed.mutate({ factId: f.id })}>Mark reviewed</Button>
                  )}
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ factId: f.id })}>Verify</Button>
                  <Button size="sm" variant="outline" disabled={reject.isPending} onClick={() => reject.mutate({ factId: f.id })}>Reject</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingFactId(f.id); setEditContent(f.content); }}>Edit</Button>
                </div>
              )}
              {f.status === "verified" && f.potentiallyOutdated && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" disabled={markStale.isPending} onClick={() => markStale.mutate({ factId: f.id })}>Mark stale</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingFactId(f.id); setEditContent(f.content); }}>Edit</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload source document</DialogTitle>
            <DialogDescription>
              {isVoiceNote
                ? "Audio only. The recording is transcribed and classified into draft facts for your review."
                : "PDF only. Text is extracted and classified into draft facts for your review."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document type</Label>
              <Select value={documentType} onValueChange={(v) => { setDocumentType(v); setPendingFile(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isVoiceNote ? "Audio file" : "PDF file"}</Label>
              <Input
                type="file"
                accept={isVoiceNote ? AUDIO_ACCEPT : PDF_ACCEPT}
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button disabled={!pendingFile || ingest.isPending} onClick={handleIngest}>
              {ingest.isPending ? "Ingesting…" : "Ingest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editingFactId !== null} onOpenChange={(o) => { if (!o) setEditingFactId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit fact</DialogTitle>
            <DialogDescription>This creates a new draft version and keeps the original in history.</DialogDescription>
          </DialogHeader>
          <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFactId(null)}>Cancel</Button>
            <Button
              disabled={!editContent.trim() || editFact.isPending}
              onClick={() => editingFactId && editFact.mutate({ factId: editingFactId, content: editContent })}
            >
              Save new version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
