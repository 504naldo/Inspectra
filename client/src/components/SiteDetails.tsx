import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, MapPin, Phone, Mail, Shield, User } from "lucide-react";
import type { SiteSummary } from "../../../drizzle/schema";

interface SiteDetailsProps {
  summary?: SiteSummary | null;
  siteName: string;
  siteAddress?: string | null;
  siteCity?: string | null;
}

export function SiteDetails({ summary, siteName, siteAddress, siteCity }: SiteDetailsProps) {
  // If no summary data, show minimal info
  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Site Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium">{siteName}</p>
            {siteAddress && (
              <p className="text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3" />
                {siteAddress}
                {siteCity && `, ${siteCity}`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { client, building, address, billing, contacts, monitoring, notes } = summary;
  const primaryContact = contacts?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Site Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Client Name */}
        {client?.name && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Client</p>
            <p className="font-medium">{client.name}</p>
          </div>
        )}

        {/* Building/Site Name */}
        {building?.name && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Building</p>
            <p className="font-medium">{building.name}</p>
            {building.year && (
              <p className="text-muted-foreground text-xs mt-0.5">Built: {building.year}</p>
            )}
            {building.class && (
              <p className="text-muted-foreground text-xs">Class: {building.class}</p>
            )}
            {building.stories && (
              <p className="text-muted-foreground text-xs">Stories: {building.stories}</p>
            )}
          </div>
        )}

        {/* Site Address */}
        {(address?.street || address?.city) && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Site Address</p>
            <p className="flex items-start gap-1">
              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                {address.street && <>{address.street}<br /></>}
                {address.city && <>{address.city}</>}
                {address.state && <>, {address.state}</>}
                {address.postalCode && <> {address.postalCode}</>}
              </span>
            </p>
          </div>
        )}

        {/* Billing Address (if different) */}
        {billing?.address && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Billing Address</p>
            <p className="text-muted-foreground">
              {billing.address}
              {billing.city && <>, {billing.city}</>}
              {billing.state && <>, {billing.state}</>}
              {billing.postalCode && <> {billing.postalCode}</>}
            </p>
          </div>
        )}

        {/* Primary Contact */}
        {primaryContact && (primaryContact.name || primaryContact.phone || primaryContact.email) && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Primary Contact</p>
            <div className="space-y-1">
              {primaryContact.name && (
                <p className="flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  {primaryContact.name}
                  {primaryContact.role && <span className="text-muted-foreground">({primaryContact.role})</span>}
                </p>
              )}
              {primaryContact.phone && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {primaryContact.phone}
                </p>
              )}
              {primaryContact.email && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {primaryContact.email}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Monitoring Information */}
        {(monitoring?.company || monitoring?.accountNumber) && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Monitoring
            </p>
            <div className="space-y-0.5 text-muted-foreground">
              {monitoring.company && <p>{monitoring.company}</p>}
              {monitoring.accountNumber && <p>Account: {monitoring.accountNumber}</p>}
              {monitoring.phone && <p>Phone: {monitoring.phone}</p>}
              {monitoring.password && (
                <p className="text-xs">
                  Passcode: <span className="font-mono">{monitoring.password}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {notes && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-muted-foreground whitespace-pre-wrap">{notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
