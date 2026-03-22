import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from "../../../shared/constants";
import { 
  Shield,
  ClipboardCheck,
  FileText,
  Smartphone,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  // Show loading state while redirecting authenticated users (prevent flash)
  // Note: Actual redirect is handled by global auth guard in App.tsx
  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Link href={user?.role === 'technician' ? '/tech' : '/admin'}>
                <Button>Go to Dashboard</Button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Sign In</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Fire Alarm Inspection & Reporting
              <span className="text-primary block mt-2">Made Simple</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Mobile-first inspection platform with AI-powered assistance, offline capability, 
              and professional PDF reports. Built for field technicians.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href={getLoginUrl()}>
                <Button size="lg" className="w-full sm:w-auto gap-2">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">
            {APP_TAGLINE}
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Smartphone className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Mobile-First Design</CardTitle>
                <CardDescription>
                  Large tap targets, quick actions, and offline capability for field use
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <ClipboardCheck className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Easy Device Testing</CardTitle>
                <CardDescription>
                  PASS/FAIL/NA buttons, notes, and photo capture in one streamlined workflow
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <AlertTriangle className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Deficiency Tracking</CardTitle>
                <CardDescription>
                  Track issues from discovery to resolution with photos and status updates
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Zap className="h-10 w-10 text-primary mb-2" />
                <CardTitle>AI-Powered Assistance</CardTitle>
                <CardDescription>
                  Generate deficiency narratives, repair recommendations, and report summaries
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <FileText className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Professional Reports</CardTitle>
                <CardDescription>
                  Branded PDF reports with executive summaries and detailed findings
                </CardDescription>
              </CardHeader>
            </Card>

          </div>
        </div>
      </section>

      {/* Role-based Access Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">
            Built for Every Role
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Technicians
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Mobile inspection workflow</li>
                  <li>• Offline data capture</li>
                  <li>• AI-assisted deficiency notes</li>
                  <li>• Photo documentation</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Office Staff
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Job scheduling</li>
                  <li>• Report generation</li>
                  <li>• Customer management</li>
                  <li>• Site & device setup</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Administrators
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Full system access</li>
                  <li>• User management</li>
                  <li>• QA review tools</li>
                  <li>• Analytics dashboard</li>
                </ul>
              </CardContent>
            </Card>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {APP_DESCRIPTION}
          </p>
        </div>
      </footer>
    </div>
  );
}
