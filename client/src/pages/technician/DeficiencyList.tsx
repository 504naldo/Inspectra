import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft, 
  Plus,
  ChevronRight,
  AlertTriangle
} from "lucide-react";
import { Link } from "wouter";
import { getDeficiencyStatusLabel, getDeficiencyStatusBadgeClass } from "@/lib/statusLabels";

interface DeficiencyListProps {
  jobId: number;
}

export default function DeficiencyList({ jobId }: DeficiencyListProps) {
  const { data: deficiencies, isLoading } = trpc.deficiency.listByJob.useQuery({ jobId });

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'major': return 'bg-warning text-warning-foreground';
      case 'minor': return 'bg-primary text-primary-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href={`/tech/jobs/${jobId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-bold text-lg flex-1">Deficiencies</h1>
          <Link href={`/tech/deficiency/new/${jobId}`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </Link>
        </div>
      </header>

      <main className="container py-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : deficiencies?.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No deficiencies recorded</p>
            <Link href={`/tech/deficiency/new/${jobId}`}>
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add Deficiency
              </Button>
            </Link>
          </div>
        ) : (
          deficiencies?.map((def: any) => (
            <Link key={def.id} href={`/tech/deficiency/${def.id}`}>
              <Card className="inspection-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityBadgeClass(def.severity)}`}>
                          {def.severity}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getDeficiencyStatusBadgeClass(def.status)}`}>
                          {getDeficiencyStatusLabel(def.status)}
                        </span>
                      </div>
                      <h3 className="font-semibold">{def.title}</h3>
                      {def.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {def.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Created {new Date(def.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
