import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ChevronDown, Play, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";

interface DeviceItem {
  id: number;
  deviceType?: string | null;
  location?: string | null;
  result?: string | null;
  walkOrder?: number | null;
}

interface ExpandableCategoryCardProps {
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
  devices: DeviceItem[];
  isExpanded: boolean;
  onToggle: () => void;
  getDeviceRoute: (deviceId: number) => string;
}

export function ExpandableCategoryCard({
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
  devices,
  isExpanded,
  onToggle,
  getDeviceRoute,
}: ExpandableCategoryCardProps) {
  const [, setLocation] = useLocation();
  const progress = totalCount > 0 ? (testedCount / totalCount) * 100 : 0;
  const hasProgress = testedCount > 0;
  const isComplete = testedCount === totalCount && totalCount > 0;
  
  // Limit preview to 10 items
  const previewDevices = devices.slice(0, 10);
  const hasMore = devices.length > 10;

  const getStatusBadge = (result?: string | null) => {
    if (!result) {
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground">
          NOT TESTED
        </span>
      );
    }
    
    const resultLower = result.toLowerCase();
    if (resultLower === 'pass') {
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
          PASS
        </span>
      );
    } else if (resultLower === 'fail') {
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          FAIL
        </span>
      );
    }
    
    return (
      <span className="px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground">
        {result.toUpperCase()}
      </span>
    );
  };

  const handleStartResume = () => {
    if (resumeRoute && hasProgress) {
      // Resume: navigate to saved route
      setLocation(resumeRoute, { replace: true });
    } else {
      // Start: expand card to show list
      if (!isExpanded) {
        onToggle();
      }
    }
  };

  return (
    <Card className={`bg-gradient-to-r ${gradientFrom} ${gradientTo} ${borderColor}`}>
      <CardContent className="p-4">
        {/* Header - Clickable to expand/collapse */}
        <div 
          className="cursor-pointer"
          onClick={onToggle}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className={`font-semibold ${textColor} flex items-center gap-2 mb-1`}>
                {icon}
                {title}
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
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
        </div>

        {/* Expandable Device List */}
        {isExpanded && totalCount > 0 && (
          <div className="mt-4 space-y-2">
            {previewDevices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between p-3 bg-white/50 dark:bg-black/20 rounded-lg cursor-pointer hover:bg-white/70 dark:hover:bg-black/30 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation(getDeviceRoute(device.id), { replace: true });
                }}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p className="font-medium text-sm truncate">
                    {device.deviceType || 'Unknown Device'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {device.location || 'No location'}
                  </p>
                </div>
                {getStatusBadge(device.result)}
              </div>
            ))}
            
            {hasMore && (
              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation(route, { replace: true });
                }}
              >
                View All ({devices.length} items)
              </Button>
            )}
          </div>
        )}

        {/* No items message */}
        {isExpanded && totalCount === 0 && (
          <div className="mt-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg text-center text-sm text-muted-foreground">
            No items found
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-3">
          <Button 
            variant="default" 
            className={`flex-1 ${buttonColor} ${buttonHoverColor}`}
            onClick={(e) => {
              e.stopPropagation();
              handleStartResume();
            }}
            disabled={totalCount === 0}
          >
            {resumeRoute && hasProgress ? 'Resume' : 'Start'}
            <Play className="h-4 w-4 ml-1" />
          </Button>
          
          {totalCount > 0 && (
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                if (!isExpanded) {
                  // Expand card to show list
                  onToggle();
                } else if (devices.length > 10) {
                  // If already expanded and has more than preview, navigate to full list
                  setLocation(route, { replace: true });
                }
              }}
            >
              View All
            </Button>
          )}
        </div>

        {isComplete && (
          <div className="mt-2 flex items-center justify-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
            <Play className="h-3 w-3" />
            Complete
          </div>
        )}
      </CardContent>
    </Card>
  );
}
