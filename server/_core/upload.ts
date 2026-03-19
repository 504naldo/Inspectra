import { Request, Response } from "express";
import formidable from "formidable";
import { getDb } from "../db";
import { attachments } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { sdk } from "./sdk";
import crypto from "crypto";
import fs from "fs";
 
// Helper: Sanitize filename for S3 storage key
function sanitizeFilename(fileName: string): string {
  return fileName
    .replace(/\s+/g, "_")
    .replace(/[,#]/g, "")
    .replace(/_{2,}/g, "_");
}
 
// Helper: Infer MIME type from file extension
function inferMimeType(fileName: string, uploadedMimeType: string): string {
  if (uploadedMimeType && uploadedMimeType !== "application/octet-stream") {
    return uploadedMimeType;
  }
 
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeMap: Record<string, string> = {
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
 
  return mimeMap[ext || ""] || "application/octet-stream";
}
 
export async function handleMultipartUpload(req: Request, res: Response) {
  try {
    // ── Authentication: verify session cookie ──
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
 
    if (!user || !user.companyId) {
      res.status(403).json({ error: "User has no company assignment" });
      return;
    }
 
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
      keepExtensions: true,
    });
 
    const [fields, files] = await form.parse(req);
 
    // Extract fields (companyId and userId come from the authenticated session, not the request)
    const entityType = fields.entityType?.[0];
    const entityId = fields.entityId?.[0];
    const jobId = fields.jobId?.[0];
    const siteId = fields.siteId?.[0];
 
    if (!entityType || !entityId) {
      res.status(400).json({ error: "Missing required fields: entityType, entityId" });
      return;
    }
 
    // Get uploaded file
    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
 
    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    
    // Sanitize filename
    const originalName = uploadedFile.originalFilename || "unnamed";
    const sanitizedFileName = sanitizeFilename(originalName);
 
    // Infer MIME type with fallback
    const contentType = inferMimeType(
      originalName,
      uploadedFile.mimetype || ""
    );
 
    // Generate unique file key — use server-side companyId from authenticated user
    const randomSuffix = crypto.randomBytes(4).toString("hex");
    const fileKey = `${user.companyId}/jobs/${jobId}/${sanitizedFileName}-${randomSuffix}`;
 
    // Upload to S3
    const { url: fileUrl } = await storagePut(fileKey, fileBuffer, contentType);
 
    // Clean up temp file
    fs.unlinkSync(uploadedFile.filepath);
 
    // Save attachment to database
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "Database unavailable" });
      return;
    }
 
    const result = await db.insert(attachments).values({
      entityType: entityType as any,
      entityId: parseInt(entityId),
      siteId: siteId ? parseInt(siteId) : undefined,
      jobId: jobId ? parseInt(jobId) : undefined,
      fileName: sanitizedFileName,
      fileKey,
      fileUrl,
      mimeType: contentType,
      fileSize: uploadedFile.size,
      uploadedById: user.id, // Server-side identity, not client-supplied
      uploadStatus: "completed",
      importStatus: "none",
    });
 
    // Get the inserted ID (MySQL returns insertId in result)
    const insertId = (result as [{ insertId?: number }, unknown])[0]?.insertId ?? 0;
 
    res.json({
      success: true,
      fileUrl,
      fileKey,
      attachmentId: insertId,
      fileName: sanitizedFileName,
      mimeType: contentType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("Upload error:", error);
    res.status(500).json({ error: message });
  }
}