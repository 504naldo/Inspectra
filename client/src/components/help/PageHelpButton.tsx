import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { HelpPanel } from "./HelpPanel";
import { routeToHelpKey, HELP_CONTENT } from "@/lib/helpContent";

interface PageHelpButtonProps {
  routeKey?: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "icon";
  className?: string;
}

export function PageHelpButton({
  routeKey: routeKeyProp,
  variant = "ghost",
  size = "sm",
  className,
}: PageHelpButtonProps) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const key = routeKeyProp ?? routeToHelpKey(location);
  const content = key ? HELP_CONTENT[key] ?? null : null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={className}
        title="Page help"
        aria-label="Open page help"
      >
        <HelpCircle className="h-4 w-4" />
        {size !== "icon" && <span className="ml-1.5">Help</span>}
      </Button>

      <HelpPanel
        open={open}
        onOpenChange={setOpen}
        helpContent={content}
        routeKey={key}
      />
    </>
  );
}
