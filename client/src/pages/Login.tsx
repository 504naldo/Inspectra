import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { Shield } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useMemo } from "react";

export default function Login() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  // Get returnTo from URL query parameter
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('returnTo') || undefined;
  }, []);
  
  // Generate login URL with returnTo parameter
  const loginUrl = useMemo(() => getLoginUrl(returnTo), [returnTo]);

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (user.role === 'customer') {
        setLocation('/customer');
      } else if (user.role === 'technician') {
        setLocation('/tech');
      } else {
        setLocation('/admin');
      }
    }
  }, [loading, isAuthenticated, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Shield className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Inspectra</CardTitle>
          <CardDescription>
            Sign in to access your inspection dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <a href={loginUrl} className="block">
            <Button className="w-full h-12 text-lg" size="lg">
              Sign In
            </Button>
          </a>
          <p className="text-center text-sm text-muted-foreground">
            Secure authentication powered by Manus
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
