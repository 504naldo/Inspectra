import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-10 pb-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Shield className="h-16 w-16 text-primary opacity-20" />
              <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-primary">!</span>
            </div>
          </div>

          <h1 className="text-5xl font-bold text-foreground mb-2">404</h1>
          <h2 className="text-lg font-semibold text-foreground mb-3">Page Not Found</h2>
          <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
            Sorry, the page you're looking for doesn't exist or may have been moved.
          </p>

          <Button onClick={() => setLocation("/")}>
            <Home className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
