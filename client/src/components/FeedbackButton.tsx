import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

function getBrowserInfo(): string {
  const ua = navigator.userAgent;
  const platform = (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";
  const lang = navigator.language ?? "";
  return `${ua.slice(0, 350)} | ${platform} | ${lang}`.slice(0, 500);
}

function getDeviceInfo(): string {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  return `${w}x${h} @${dpr}x`;
}

interface FeedbackButtonProps {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
  label?: string;
  className?: string;
  entityType?: string;
  entityId?: number;
}

export function FeedbackButton({
  variant = "ghost",
  size = "sm",
  label = "Feedback",
  className,
  entityType,
  entityId,
}: FeedbackButtonProps) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [includePage, setIncludePage] = useState(true);

  const submit = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted — thank you!");
      setOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || "Failed to submit feedback"),
  });

  function resetForm() {
    setType("bug");
    setTitle("");
    setDescription("");
    setPriority("medium");
    setIncludePage(true);
  }

  function handleOpen() {
    resetForm();
    setOpen(true);
  }

  function handleSubmit() {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    submit.mutate({
      type: type as any,
      title: title.trim(),
      description: description.trim() || undefined,
      priority: priority as any,
      pageUrl: includePage ? window.location.pathname : undefined,
      routeName: includePage ? location : undefined,
      entityType,
      entityId,
      browserInfo: getBrowserInfo(),
      deviceInfo: getDeviceInfo(),
    });
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleOpen}
        className={className}
        title="Submit feedback or report an issue"
      >
        <MessageSquare className="h-4 w-4" />
        {size !== "icon" && <span className="ml-1.5">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!submit.isPending) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Submit Feedback
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug / Error</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="confusing_workflow">Confusing Workflow</SelectItem>
                  <SelectItem value="data_issue">Data Issue</SelectItem>
                  <SelectItem value="report_output_issue">Report Output Issue</SelectItem>
                  <SelectItem value="mobile_issue">Mobile Issue</SelectItem>
                  <SelectItem value="performance_issue">Performance Issue</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="Brief description of the issue or request"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={255}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Steps to reproduce, what you expected vs what happened, any other context…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={5000}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Suggested Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — minor annoyance</SelectItem>
                  <SelectItem value="medium">Medium — affects my workflow</SelectItem>
                  <SelectItem value="high">High — significant issue</SelectItem>
                  <SelectItem value="urgent">Urgent — blocking my work</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="fb-include-page"
                checked={includePage}
                onCheckedChange={(v) => setIncludePage(!!v)}
              />
              <Label htmlFor="fb-include-page" className="cursor-pointer font-normal text-sm">
                Include current page ({window.location.pathname})
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submit.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submit.isPending || !title.trim()}
            >
              {submit.isPending ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
