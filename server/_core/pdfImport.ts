import { createRequire } from "module";
import { invokeLLM } from "./llm";
import * as db from "../db";
import { storagePut } from "../storage";
import { isSchemaEcho } from "./schemaEcho";

const require = createRequire(import.meta.url);

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
    buildingId: string | null;
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
 * Reject a value that is obviously a leaked schema placeholder rather than
 * extracted content. Returns the trimmed string, or null when the value is
 * empty / a placeholder echo (see isSchemaEcho) / a literal "null".
 */
function cleanExtractedValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isSchemaEcho(trimmed)) return null;
  return trimmed;
}

/**
 * Scrub an AI extraction result so leaked schema placeholders never reach the
 * database. Every free-text field is passed through cleanExtractedValue, and
 * device rows whose type collapses to nothing are dropped.
 */
export function sanitizeExtractedSiteData(data: ExtractedSiteData): ExtractedSiteData {
  const site = data.site ?? ({} as ExtractedSiteData["site"]);
  const cleanedSite = {
    name: cleanExtractedValue(site.name),
    address: cleanExtractedValue(site.address),
    city: cleanExtractedValue(site.city),
    state: cleanExtractedValue(site.state),
    postalCode: cleanExtractedValue(site.postalCode),
    contactName: cleanExtractedValue(site.contactName),
    contactPhone: cleanExtractedValue(site.contactPhone),
    contactEmail: cleanExtractedValue(site.contactEmail),
    customerOrgName: cleanExtractedValue(site.customerOrgName),
    monitoringCompany: cleanExtractedValue(site.monitoringCompany),
    monitoringAccount: cleanExtractedValue(site.monitoringAccount),
    buildingId: cleanExtractedValue(site.buildingId),
    buildingYear: cleanExtractedValue(site.buildingYear),
    buildingClass: cleanExtractedValue(site.buildingClass),
    stories: cleanExtractedValue(site.stories),
    notes: cleanExtractedValue(site.notes),
  };

  const devices = Array.isArray(data.devices) ? data.devices : [];
  const cleanedDevices = devices
    .map((d) => ({
      ...d,
      deviceType: cleanExtractedValue(d.deviceType) ?? "",
      location: cleanExtractedValue(d.location),
      floor: cleanExtractedValue(d.floor),
      manufacturer: cleanExtractedValue(d.manufacturer),
      model: cleanExtractedValue(d.model),
      serialNumber: cleanExtractedValue(d.serialNumber),
      notes: cleanExtractedValue(d.notes),
    }))
    // A device with no usable type is unusable noise (usually a leaked schema row).
    .filter((d) => d.deviceType.length > 0);

  return { ...data, site: cleanedSite, devices: cleanedDevices };
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  // pdf-parse is CJS; use createRequire to avoid ESM interop issues
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
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
        content: `You are a fire alarm inspection data extraction expert. You extract structured data from fire inspection report text. You must return ONLY valid JSON with no other text.

Return JSON with EXACTLY this shape. Every value below is shown as null / "" / 0 — replace it with the real value extracted from the report. If the report does not contain a field, leave it as null. NEVER copy the field descriptions in the "Field guide" below into the output — those are guidance only, not values.

{
  "site": {
    "name": null,
    "address": null,
    "city": null,
    "state": null,
    "postalCode": null,
    "contactName": null,
    "contactPhone": null,
    "contactEmail": null,
    "customerOrgName": null,
    "monitoringCompany": null,
    "monitoringAccount": null,
    "buildingId": null,
    "buildingYear": null,
    "buildingClass": null,
    "stories": null,
    "notes": null
  },
  "devices": [
    {
      "deviceType": "",
      "category": "",
      "location": null,
      "floor": null,
      "manufacturer": null,
      "model": null,
      "serialNumber": null,
      "notes": null
    }
  ],
  "summary": {
    "totalDevices": 0,
    "categories": {"FIRE_ALARM_DEVICE": 0, "SMOKE_ALARM": 0, "FIRE_EXTINGUISHER": 0, "EMERGENCY_LIGHT": 0, "SPRINKLER": 0},
    "confidence": "high",
    "warnings": []
  }
}

Field guide (describes what to put in each field — do NOT output this text):
- site.name: the building/site name
- site.address: street address
- site.state: province/state
- site.contactName: building manager or site contact
- site.customerOrgName: the client/customer organization name
- site.monitoringCompany: alarm monitoring company name
- site.monitoringAccount: monitoring account number
- site.buildingId: EWF building/account ID or file number if present (e.g. 'EWF-1234', 'A-0042')
- site.stories: number of stories/floors
- site.notes: any relevant notes about the site
- devices[].deviceType: e.g. 'Smoke Detector', 'Pull Station', 'Heat Detector', 'Horn/Strobe', 'Fire Extinguisher', 'Emergency Light', 'Exit Sign', 'Sprinkler Head'
- devices[].category: MUST be exactly one of FIRE_ALARM_DEVICE, SMOKE_ALARM, FIRE_EXTINGUISHER, EMERGENCY_LIGHT, SPRINKLER
- devices[].location: where in the building
- devices[].floor: floor number or name
- summary.confidence: one of "high", "medium", or "low"
- If there are no devices, return "devices": [].

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

  let parsed: ExtractedSiteData;
  try {
    parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as ExtractedSiteData;
  } catch {
    throw new Error("AI extraction returned invalid JSON: " + content.substring(0, 200));
  }
  // Guard against the model echoing the schema's placeholder descriptions
  // (e.g. a site literally named "string or null - the building/site name").
  return sanitizeExtractedSiteData(parsed);
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
        buildingId: extracted.site.buildingId || undefined,
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

  // 5. Create devices — preserve the order they appear in the report, appended
  //    after any devices already on the site.
  let devicesCreated = 0;
  const sortBase = await db.getMaxDeviceSortOrder(siteId!);
  for (let idx = 0; idx < extracted.devices.length; idx++) {
    const device = extracted.devices[idx];
    try {
      await db.createDevice({
        companyId,
        siteId: siteId!,
        sortOrder: sortBase + idx + 1,
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
