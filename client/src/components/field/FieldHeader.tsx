import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared sticky header for technician field screens.
 *
 * Replaces the ~10 hand-copied `<header className="sticky top-0 z-50 bg-card
 * border-b">…` blocks and fixes their z-index drift — one screen was `z-10` and
 * could be overlapped by page content. All field chrome now sits at `z-40`,
 * a single tier below shadcn's `z-50` dialogs/dropdowns/popovers.
 *
 * The variable right-hand content (connection badge, help button, actions) is
 * passed as children; the component owns the sticky wrapper, back button, and
 * the title/subtitle layout.
 */
export function FieldHeader({
  backHref,
  onBack,
  title,
  subtitle,
  children,
}: {
  backHref?: string;
  onBack?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 bg-card border-b">
      <div className="container flex h-16 items-center gap-4">
        {backHref ? (
          <Link href={backHref}>
            <Button variant="ghost" size="icon" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        ) : onBack ? (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : null}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-lg truncate">{title}</h1>
          {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </header>
  );
}
