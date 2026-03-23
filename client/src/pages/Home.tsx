import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading || (isAuthenticated && user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#16324F]">
      <div className="flex flex-col items-center gap-6 text-center px-4">
        <Shield className="h-14 w-14 text-white/90" />
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Inspectra</h1>
          <p className="text-white/60 text-sm tracking-wide uppercase">
            Fire Alarm Inspection &amp; Reporting
          </p>
        </div>
        <a href={getLoginUrl()}>
          <Button
            size="lg"
            className="bg-white text-[#16324F] hover:bg-white/90 font-semibold px-8"
          >
            Sign In with Google
          </Button>
        </a>
      </div>
    </div>
  );
}
