import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

interface ForbiddenProps {
  requiredRole?: string;
  message?: string;
}

export default function Forbidden({ requiredRole, message }: ForbiddenProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const handleGoBack = () => {
    // Redirect to role-appropriate dashboard
    if (user?.role === 'admin' || user?.role === 'office') {
      setLocation('/admin');
    } else if (user?.role === 'technician') {
      setLocation('/tech/jobs');
    } else if (user?.role === 'customer') {
      setLocation('/customer');
    } else {
      setLocation('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-destructive/10 p-3">
              <ShieldAlert className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription>
            {message || "You don't have permission to access this page"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Role:</span>
              <span className="font-medium">{user?.role || 'Unknown'}</span>
            </div>
            {requiredRole && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Required Role:</span>
                <span className="font-medium">{requiredRole}</span>
              </div>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">If you believe you should have access to this page:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Contact your administrator to update your role</li>
              <li>Verify you're logged in with the correct account</li>
              <li>Try logging out and logging back in</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <Button onClick={handleGoBack} className="w-full">
              Go to Dashboard
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setLocation('/')} 
              className="w-full"
            >
              Go to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
