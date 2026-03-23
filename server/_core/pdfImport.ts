import { invokeLLM } from "./llm";
import * as db from "../db";
import { storagePut } from "../storage";

// -------------------------------------------------------
// Device categories matching the DB enum exactly
// -------------------------------------------------------
// DB enum: ["FIRE_EXTINGUISHER", "EMERGENCY_LIGHT", "FIRE_ALARM_DEVICE", "SMOKE_ALARM", "SPRINKLER"]

export interface ExtractedSiteData {
  site: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    customerOrgName: string | null;
    monitoringCompany: string | null;
    monitoringAccount: string | null;
    buildingYear: string | null;
    buildingClass: string | null;
    stories: string | null;
    notes: string | null;
  };
  devices: Array<{
    deviceType: string;
    category: "FIRE_ALARM_DEVICE" | "SMOKE_ALARM" | "FIRE_EXTINGUISHER" | "EMERGENCY_LIGHT" | "SPRINKLER";
    location: string | null;
    floor: string | null;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    notes: string | null;
  }>;
  summary: {
    totalDevices: number;
    categories: Record<string, number>;
    confidence: "high" | "medium" | "low";
    warnings: string[];
  };
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(pdfBuffer);
  return data.text;
}

/**
 * Use AI to extract structured site info and device data from inspection report text.
 */
export async function extractSiteDataFromPdf(pdfText: string): Promise<ExtractedSiteData> {
  const maxChars = 30000;
  const truncatedText =
    pdfText.length > maxChars
      ? pdfText.substring(0, maxChars) + "\n\n[... truncated ...]"
      : pdfText;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a fire alarm inspection data extraction expert. You extract structured data from fire inspection report text. You must return ONLY valid JSON with no other text. The JSON must match this exact schema:

{
  "site": {
    "name": "string or null - the building/site name",
    "address": "string or null - street address",
    "city": "string or null",
    "state": "string or null - province/state",
    "postalCode": "string or null",
    "contactName": "string or null - building manager or site contact",
    "contactPhone": "string or null",
    "contactEmail": "string or null",
    "customerOrgName": "string or null - the client/customer organization name",
    "monitoringCompany": "string or null - alarm monitoring company name",
    "monitoringAccount": "string or null - monitoring account number",
    "buildingYear": "string or null",
    "buildingClass": "string or null",
    "stories": "string or null - number of stories/floors",
    "notes": "string or null - any relevant notes about the site"
  },
  "devices": [
    {
      "deviceType": "string - e.g. 'Smoke Detector', 'Pull Station', 'Heat Detector', 'Horn/Strobe', 'Fire Extinguisher', 'Emergency Light', 'Exit Sign', 'Sprinkler Head'",
      "category": "string - MUST be exactly one of: FIRE_ALARM_DEVICE, SMOKE_ALARM, FIRE_EXTINGUISHER, EMERGENCY_LIGHT, SPRINKLER",
      "location": "string or null - where in the building",
      "floor": "string or null - floor number or name",
      "manufacturer": "string or null",
      "model": "string or null",
      "serialNumber": "string or null",
      "notes": "string or null"
    }
  ],
  "summary": {
    "totalDevices": 0,
    "categories": {"FIRE_ALARM_DEVICE": 0, "SMOKE_ALARM": 0, "FIRE_EXTINGUISHER": 0, "EMERGENCY_LIGHT": 0, "SPRINKLER": 0},
    "confidence": "high, medium, or low",
    "warnings": []
  }
}

Category mapping rules (use EXACTLY these values):
- FIRE_ALARM_DEVICE: smoke detectors, heat detectors, pull stations, manual call points, horns, strobes, horn/strobes, duct detectors, beam detectors, annunciators, FACP, control panels, flow switches, tamper switches
- SMOKE_ALARM: standalone/residential smoke alarms (battery or hardwired in suites/units)
- FIRE_EXTINGUISHER: all fire extinguishers (ABC, CO2, wet chemical, etc.)
- EMERGENCY_LIGHT: emergency lights, exit signs, combo emergency/exit units
- SPRINKLER: sprinkler heads, PIV, FDC, sprinkler system components

Extract ALL devices you can find. If a device count is mentioned but locations aren't listed, create that many entries with "Location TBD". If PDF is not an inspection report, extract what you can and set confidence to "low".`,
      },
      {
        role: "user",
        content: `Extract site information and device data from this fire inspection report:\n\n${truncatedText}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI extraction returned empty response");
  }

  try {
    return JSON.parse(content.replace(/```json|```/g, "").trim()) as ExtractedSiteData;
  } catch {
    throw new Error("AI extraction returned invalid JSON: " + content.substring(0, 200));
  }
}

export interface PdfImportOpts {
  pdfBuffer: Buffer;
  fileName: string;
  companyId: number;
  userId: number;
  customerOrgId?: number;
  siteId?: number;
}

export interface PdfImportResult {
  success: true;
  siteId: number;
  siteName: string;
  customerOrgId: number;
  devicesCreated: number;
  summary: ExtractedSiteData["summary"];
  siteInfo: ExtractedSiteData["site"];
}

/**
 * Core PDF import logic: extract → create org/site/devices → store PDF in S3.
 * Shared between importPdfFromDrive and importPdfFromUpload.
 */
export async function importPdfData(opts: PdfImportOpts): Promise<PdfImportResult> {
  const { pdfBuffer, fileName, companyId, userId, customerOrgId: inputCustomerOrgId, siteId: inputSiteId } = opts;

  // 1. Extract text
  const pdfText = await extractPdfText(pdfBuffer);
  if (!pdfText || pdfText.trim().length < 50) {
    throw new Error(
      "Could not extract text from this PDF. It may be a scanned document or image-only PDF."
    );
  }

  // 2. AI extraction
  const extracted = await extractSiteDataFromPdf(pdfText);

  // 3. Upsert customer org
  let customerOrgId = inputCustomerOrgId;
  if (!customerOrgId) {
    const orgName = extracted.site.customerOrgName || extracted.site.name || fileName.replace(/\.[^.]+$/, "");
    const existingOrgs = await db.getCustomerOrgsByCompany(companyId);
    const match = existingOrgs.find(
      (o: any) => o.name.toLowerCase() === orgName.toLowerCase()
    );
    if (match) {
      customerOrgId = match.id;
    } else {
      const newOrg = await db.createCustomerOrg({
        companyId,
        name: orgName,
        contactName: extracted.site.contactName || null,
        contactEmail: extracted.site.contactEmail || null,
        contactPhone: extracted.site.contactPhone || null,
      });
      customerOrgId = newOrg.id;
    }
  }

  // 4. Upsert site
  let siteId = inputSiteId;
  if (!siteId) {
    const siteName = extracted.site.name || fileName.replace(/\.[^.]+$/, "");
    const existingSites = await db.getSitesByCustomerOrg(customerOrgId!);
    const match = existingSites.find(
      (s: any) => s.name.toLowerCase() === siteName.toLowerCase()
    );
    if (match) {
      siteId = match.id;
    } else {
      const summary = {
        client: { name: extracted.site.customerOrgName || siteName },
        building: {
          name: siteName,
          year: extracted.site.buildingYear || "",
          class: extracted.site.buildingClass || "",
          stories: extracted.site.stories || "",
        },
        address: {
          street: extracted.site.address || "",
          city: extracted.site.city || "",
          state: extracted.site.state || "",
          postalCode: extracted.site.postalCode || "",
        },
        contacts: [
          {
            name: extracted.site.contactName || "",
            phone: extracted.site.contactPhone || "",
            email: extracted.site.contactEmail || "",
            role: "Primary Contact",
          },
        ],
        monitoring: {
          company: extracted.site.monitoringCompany || "",
          accountNumber: extracted.site.monitoringAccount || "",
          phone: "",
          password: "",
        },
        notes: extracted.site.notes || "",
      };
      const newSite = await db.createSite({
        companyId,
        customerOrgId: customerOrgId!,
        name: siteName,
        address: extracted.site.address || undefined,
        city: extracted.site.city || undefined,
        state: extracted.site.state || undefined,
        postalCode: extracted.site.postalCode || undefined,
        contactName: extracted.site.contactName || undefined,
        contactPhone: extracted.site.contactPhone || undefined,
        summary,
      });
      siteId = newSite.id;
    }
  }

  // 5. Create devices
  let devicesCreated = 0;
  for (const device of extracted.devices) {
    try {
      await db.createDevice({
        companyId,
        siteId: siteId!,
        deviceType: device.deviceType,
        category: device.category as any,
        location: device.location || undefined,
        manufacturer: device.manufacturer || undefined,
        model: device.model || undefined,
        serialNumber: device.serialNumber || undefined,
        notes: device.notes || undefined,
      });
      devicesCreated++;
    } catch (err) {
      console.warn("[PDF Import] Failed to create device:", device.deviceType, err);
    }
  }

  // 6. Store PDF in S3 as site attachment
  const safeFileName = fileName.replace(/\s+/g, "_");
  const fileKey = `pdf-imports/${companyId}/${siteId}/${Date.now()}-${safeFileName}`;
  const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

  await db.createAttachment({
    entityType: "site",
    entityId: siteId!,
    uploadedById: userId,
    fileName,
    fileKey,
    fileUrl,
    mimeType: "application/pdf",
    fileSize: pdfBuffer.length,
    siteId: siteId!,
  });

  return {
    success: true,
    siteId: siteId!,
    siteName: extracted.site.name || fileName.replace(/\.[^.]+$/, ""),
    customerOrgId: customerOrgId!,
    devicesCreated,
    summary: extracted.summary,
    siteInfo: extracted.site,
  };
}
