// Knowledge extraction — turns an uploaded document's extracted text into a set
// of candidate, source-grounded facts for human review.
//
// Safety posture (see Property & Equipment Knowledge System plan):
// - Every candidate fact MUST carry a verbatim excerpt from the source text;
//   facts without an excerpt are dropped before they ever reach the database.
// - Output is always draft. Nothing here verifies, approves, or writes records.
// - The model is told to extract only what the text supports — no inference of
//   life-safety procedures, no invented values.

import crypto from "crypto";
import { invokeLLM } from "./llm";
import type { KNOWLEDGE_DOCUMENT_TYPES, KNOWLEDGE_FACT_SOURCE_TYPES } from "../../drizzle/schema";

type DocumentType = (typeof KNOWLEDGE_DOCUMENT_TYPES)[number];
type FactSourceType = (typeof KNOWLEDGE_FACT_SOURCE_TYPES)[number];

export interface CandidateFact {
  content: string;
  sourceType: FactSourceType;
  citationExcerpt: string;
  locationRef: string | null;
  confidence: "high" | "medium" | "low";
}

export interface ClassificationResult {
  facts: CandidateFact[];
  modelUsed: string;
  promptHash: string;
}

const MODEL = "gpt-4o-mini";
const MAX_INPUT_CHARS = 30000;
const FACT_SOURCE_TYPES: FactSourceType[] = [
  "manufacturer_doc",
  "code_requirement",
  "company_procedure",
  "technician_observation",
  "ai_inference",
];

function documentGuidance(documentType: DocumentType): string {
  switch (documentType) {
    case "equipment_manual":
      return "This is a manufacturer equipment manual. Most facts should be source_type 'manufacturer_doc' (specifications, ratings, maintenance intervals the manufacturer states).";
    case "inspection_report":
      return "This is a past inspection report. Observed conditions and test results recorded by a technician should be 'technician_observation'. Do not restate pass/fail as if it is current truth — describe what the report recorded and when, if a date is present.";
    case "code_document":
      return "This is a code/standard document. Requirements should be 'code_requirement'.";
    case "company_procedure":
      return "This is an internal company procedure. Facts should be 'company_procedure'.";
    case "voice_note":
      return "This is a transcribed technician voice note. Facts should be 'technician_observation'.";
    default:
      return "Classify each fact's source_type using the best fit from the allowed values.";
  }
}

/**
 * Classify extracted document text into candidate facts.
 *
 * `propertyContext` is a short, already company-scoped description of the
 * subject (e.g. site name/address) used only to help the model phrase facts —
 * it must never contain another tenant's data.
 */
export async function classifyDocumentText(params: {
  text: string;
  documentType: DocumentType;
  propertyContext: string;
}): Promise<ClassificationResult> {
  const truncated =
    params.text.length > MAX_INPUT_CHARS
      ? params.text.slice(0, MAX_INPUT_CHARS) + "\n\n[... truncated ...]"
      : params.text;

  const systemPrompt = `You are a fire-protection knowledge extraction assistant. You read source documents and extract discrete, verifiable facts about a specific property, system, or piece of equipment.

Strict rules:
- Extract only facts the provided text actually supports. Never invent values, model numbers, dates, or readings.
- Every fact MUST include a short verbatim "citation_excerpt" copied from the source text that supports it. If you cannot quote supporting text, do not emit the fact.
- Keep each fact to one clear statement.
- Do NOT produce approved life-safety procedures or compliance determinations. Describe what the document says; do not certify anything.
- Allowed source_type values: ${FACT_SOURCE_TYPES.join(", ")}.
- ${documentGuidance(params.documentType)}
- Return at most 40 facts. Prefer the most useful, durable facts.`;

  const userPrompt = `PROPERTY/SUBJECT CONTEXT:
${params.propertyContext}

SOURCE DOCUMENT TEXT:
${truncated}

Extract the facts as JSON.`;

  const promptHash = crypto
    .createHash("sha256")
    .update(`${MODEL}\n${systemPrompt}\n${userPrompt}`)
    .digest("hex");

  const response = await invokeLLM({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "extracted_facts",
        strict: true,
        schema: {
          type: "object",
          properties: {
            facts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "One clear factual statement" },
                  source_type: { type: "string", enum: FACT_SOURCE_TYPES },
                  citation_excerpt: { type: "string", description: "Verbatim supporting text from the source" },
                  location_ref: { type: ["string", "null"], description: "Page/section reference if visible, else null" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["content", "source_type", "citation_excerpt", "location_ref", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["facts"],
          additionalProperties: false,
        },
      },
    },
    maxTokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Knowledge classification returned an empty response");
  }

  let parsed: { facts: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Knowledge classification response could not be parsed");
  }

  // Drop anything without a usable excerpt — the citation guarantee is enforced
  // here as well as at the router, so an AI fact can never be persisted uncited.
  const facts: CandidateFact[] = (parsed.facts ?? [])
    .map((f) => ({
      content: typeof f.content === "string" ? f.content.trim() : "",
      sourceType: FACT_SOURCE_TYPES.includes(f.source_type as FactSourceType)
        ? (f.source_type as FactSourceType)
        : "ai_inference",
      citationExcerpt: typeof f.citation_excerpt === "string" ? f.citation_excerpt.trim() : "",
      locationRef: typeof f.location_ref === "string" && f.location_ref.trim() ? f.location_ref.trim() : null,
      confidence: (["high", "medium", "low"] as const).includes(f.confidence as any)
        ? (f.confidence as "high" | "medium" | "low")
        : "low",
    }))
    .filter((f) => f.content.length > 0 && f.citationExcerpt.length > 0);

  return { facts, modelUsed: MODEL, promptHash };
}
