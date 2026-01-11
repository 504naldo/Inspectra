import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, Play, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";

interface InspectionCategoryCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  testedCount: number;
  totalCount: number;
  deficiencyCount?: number;
  route: string;
  resumeRoute?: string;
  gradientFrom: string;
  gradientTo: string;
  borderColor: string;
  textColor: string;
  buttonColor: string;
  buttonHoverColor: string;
}

export function InspectionCategoryCard({
  title,
  description,
  icon,
  testedCount,
  totalCount,
  deficiencyCount,
  route,
  resumeRoute,
  gradientFrom,
  gradientTo,
  borderColor,
  textColor,
  buttonColor,
  buttonHoverColor,
}: InspectionCategoryCardProps) {
  const [, setLocation] = useLocation();
  const progress = totalCount > 0 ? (testedCount / totalCount) * 100 : 0;
  const hasProgress = testedCount > 0;
  const isComplete = testedCount === totalCount && totalCount > 0;

  return (
    <Card className={`bg-gradient-to-r ${gradientFrom} ${gradientTo} ${borderColor}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className={`font-semibold ${textColor} flex items-center gap-2 mb-1`}>
              {icon}
              {title}
            </h3>
            <p className={`text-sm ${textColor.replace('900', '700').replace('100', '300')} opacity-90`}>
              {description}
            </p>
          </div>
        </div>

        {/* Progress Section */}
        {totalCount > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className={`font-medium ${textColor}`}>
                {testedCount} / {totalCount} tested
              </span>
              {deficiencyCount !== undefined && deficiencyCount > 0 && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  {deficiencyCount} {deficiencyCount === 1 ? 'issue' : 'issues'}
                </span>
              )}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Action Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {isComplete && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                <Play className="h-3 w-3" />
                Complete
              </span>
            )}
          </div>
          <Button 
            variant="default" 
            className={`${buttonColor} ${buttonHoverColor}`}
            onClick={() => {
              const targetRoute = resumeRoute && hasProgress ? resumeRoute : route;
              setLocation(targetRoute, { replace: true });
            }}
          >
            {resumeRoute && hasProgress ? 'Resume' : 'Start'}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
