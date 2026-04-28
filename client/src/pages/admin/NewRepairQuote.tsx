import { useState } from "react";
import { useLocation } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { FileText, Loader2 } from "lucide-react";

export default function NewRepairQuote() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // Job search
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  // Quote settings
  const [techLabourRate, setTechLabourRate] = useState("75");
  const [fitterLabourRate, setFitterLabourRate] = useState("65");
  const [validDays, setValidDays] = useState("30");
  const [notes, setNotes] = useState("");

  // Deficiency selection
  const [selectedDefIds, setSelectedDefIds] = useState<number[]>([]);

  const { data: jobs = [] } = trpc.job.listByCompany.useQuery(
    { companyId: user!.companyId! },
    { enabled: !!user?.companyId }
  );

  const { data: deficiencies = [] } = trpc.deficiency.listByJob.useQuery(
    { jobId: selectedJobId! },
    { enabled: !!selectedJobId }
  );

  const createMut = trpc.repairQuote.createRepairQuote.useMutation({
    onSuccess: (data) => {
      toast.success(`Repair quote ${data.quoteNumber} created`);
      navigate(`/admin/repair-quotes/${data.quoteId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredJobs = jobs.filter((j) =>
    !jobSearch ||
    j.jobNumber.toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.title.toLowerCase().includes(jobSearch.toLowerCase())
  );

  const openDefs = deficiencies.filter((d) => d.status === "open" || d.status === "in_progress");

  function toggleDef(id: number) {
    setSelectedDefIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function handleCreate() {
    if (!selectedJobId) { toast.error("Select a job first."); return; }
    createMut.mutate({
      jobId: selectedJobId,
      deficiencyIds: selectedDefIds.length > 0 ? selectedDefIds : undefined,
      techLabourRate: parseFloat(techLabourRate) || 75,
      fitterLabourRate: parseFloat(fitterLabourRate) || 65,
      validDays: parseInt(validDays) || 30,
      notes: notes.trim() || undefined,
    });
  }

  const SEVERITY_COLORS: Record<string, string> = {
    critical: "text-red-600 border-red-200 bg-red-50",
    major:    "text-orange-600 border-orange-200 bg-orange-50",
    minor:    "text-yellow-700 border-yellow-200 bg-yellow-50",
    observation: "text-blue-600 border-blue-200 bg-blue-50",
  };

  return (
    <AdminLayout title="New Repair Quote">
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            New Repair Quote
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create a repair quote from job deficiencies. You can add parts and labour on the detail page.
          </p>
        </div>

        {/* Step 1: Select Job */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Select Job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search by job number or title…"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
            />
            <div className="max-h-52 overflow-y-auto divide-y rounded border">
              {filteredJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No jobs found.</p>
              ) : (
                filteredJobs.slice(0, 50).map((job) => (
                  <button
                    key={job.id}
                    onClick={() => { setSelectedJobId(job.id); setSelectedDefIds([]); }}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors ${selectedJobId === job.id ? "bg-primary/10 font-medium" : ""}`}
                  >
                    <span className="font-medium">{job.jobNumber}</span>
                    <span className="text-muted-foreground"> — {job.title}</span>
                  </button>
                ))
              )}
            </div>
            {selectedJobId && (
              <p className="text-xs text-primary font-medium">
                ✓ Job #{jobs.find((j) => j.id === selectedJobId)?.jobNumber} selected
              </p>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Select Deficiencies */}
        {selectedJobId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Select Deficiencies (optional)</CardTitle>
            </CardHeader>
            <CardContent>
              {openDefs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open deficiencies for this job. You can add repair items manually on the next screen.</p>
              ) : (
                <div className="space-y-2">
                  {openDefs.map((d) => (
                    <label key={d.id} className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={selectedDefIds.includes(d.id)}
                        onChange={() => toggleDef(d.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{d.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${SEVERITY_COLORS[d.severity] ?? ""}`}>
                            {d.severity}
                          </span>
                        </div>
                        {d.observedIssue && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{d.observedIssue}</p>
                        )}
                      </div>
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground pt-1">
                    {selectedDefIds.length === 0 ? "No deficiencies selected — quote will start empty." : `${selectedDefIds.length} deficiency items pre-loaded.`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Labour Rates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Default Labour Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tech Rate ($/hr)</Label>
                <Input type="number" min="0" step="1" value={techLabourRate} onChange={(e) => setTechLabourRate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fitter Rate ($/hr)</Label>
                <Input type="number" min="0" step="1" value={fitterLabourRate} onChange={(e) => setFitterLabourRate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Valid For (days)</Label>
                <Select value={validDays} onValueChange={setValidDays}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">4. Notes (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Additional notes, conditions, or context for the customer…"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            onClick={handleCreate}
            disabled={!selectedJobId || createMut.isPending}
            className="gap-2"
          >
            {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Repair Quote
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/quotes")}>
            Cancel
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
