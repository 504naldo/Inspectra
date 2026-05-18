import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, technicianProcedure, officeProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";

// AI Features router
const aiRouter = router({
  // Deficiency narrative generator
  generateDeficiencyNarrative: technicianProcedure.input(z.object({
    deviceType: z.string(),
    location: z.string(),
    observedIssue: z.string(),
    testOutcome: z.string(),
    codeReference: z.string().optional(),
    priorHistory: z.string().optional(),
  })).mutation(async ({ input }) => {
    // Validate required fields
    const missingFields: string[] = [];
    
    if (!input.location || input.location.trim() === '' || input.location === 'Unknown location') {
      missingFields.push('location');
    }
    
    if (!input.observedIssue || input.observedIssue.trim() === '') {
      missingFields.push('observed issue');
    }
    
    if (!input.deviceType || input.deviceType.trim() === '') {
      missingFields.push('device type');
    }
    
    if (missingFields.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Missing required fields: ${missingFields.join(', ')}. Please provide all required information before generating narrative.`
      });
    }
    const prompt = `You are a fire alarm inspection expert. Generate a professional deficiency narrative based on the following information:

Device Type: ${input.deviceType}
Location: ${input.location}
Observed Issue: ${input.observedIssue}
Test Outcome: ${input.testOutcome}
${input.codeReference ? `Code Reference: ${input.codeReference}` : ''}
${input.priorHistory ? `Prior History: ${input.priorHistory}` : ''}

Please provide:
1. A professional deficiency description (technical, detailed)
2. Recommended corrective action (specific steps)
3. Customer-friendly explanation (non-technical, easy to understand)

Format your response as JSON with keys: description, correctiveAction, customerExplanation`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm inspection expert assistant. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "deficiency_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              description: { type: "string", description: "Technical deficiency description" },
              correctiveAction: { type: "string", description: "Recommended corrective action" },
              customerExplanation: { type: "string", description: "Customer-friendly explanation" }
            },
            required: ["description", "correctiveAction", "customerExplanation"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return { ...JSON.parse(content), isDraft: true };
  }),
  
  // Smart repair recommendations
  generateRepairRecommendations: technicianProcedure.input(z.object({
    deviceType: z.string(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    issue: z.string(),
    deficiencyDescription: z.string().optional(),
  })).mutation(async ({ input }) => {
    const prompt = `You are a fire alarm repair expert. Provide repair recommendations for:

Device Type: ${input.deviceType}
${input.manufacturer ? `Manufacturer: ${input.manufacturer}` : ''}
${input.model ? `Model: ${input.model}` : ''}
Issue: ${input.issue}
${input.deficiencyDescription ? `Deficiency Description: ${input.deficiencyDescription}` : ''}

Please provide:
1. Troubleshooting steps (numbered list)
2. Suggested parts and tools needed
3. Suggested evidence photos to take
4. Repair checklist

Format your response as JSON with keys: troubleshootingSteps (array), partsAndTools (array), suggestedPhotos (array), repairChecklist (array)`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm repair expert assistant. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "repair_recommendations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              troubleshootingSteps: { type: "array", items: { type: "string" } },
              partsAndTools: { type: "array", items: { type: "string" } },
              suggestedPhotos: { type: "array", items: { type: "string" } },
              repairChecklist: { type: "array", items: { type: "string" } }
            },
            required: ["troubleshootingSteps", "partsAndTools", "suggestedPhotos", "repairChecklist"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return JSON.parse(content);
  }),
  
  // Inspection report summary writer
  generateReportSummary: officeProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    
    const site = await db.getSiteById(job.siteId);
    const stats = await db.getInspectionStats(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    const criticalCount = deficiencies.filter(d => d.severity === 'critical').length;
    const majorCount = deficiencies.filter(d => d.severity === 'major').length;
    const minorCount = deficiencies.filter(d => d.severity === 'minor').length;
    
    const prompt = `You are a fire alarm inspection report writer. Generate an executive summary for this inspection:

Site: ${site?.name || 'Unknown'}
Address: ${site?.address || 'N/A'}
Job Type: ${job.jobType}
Inspection Date: ${job.completedAt || job.scheduledDate || 'N/A'}

Results:
- Total Devices Tested: ${stats.total}
- Passed: ${stats.pass}
- Failed: ${stats.fail}
- N/A: ${stats.na}
- Not Tested: ${stats.notTested}

Deficiencies Found: ${deficiencies.length}
- Critical: ${criticalCount}
- Major: ${majorCount}
- Minor: ${minorCount}

Deficiency Details:
${deficiencies.slice(0, 10).map(d => `- ${d.title}: ${d.description || 'No description'}`).join('\n')}

Please provide:
1. Executive summary bullets (3-5 key points)
2. Overall system status assessment
3. Priority items requiring immediate attention
4. Recommended next steps

Important: Only report observed facts. Do not make conclusions about cause or origin.

Format your response as JSON with keys: executiveSummary (array of strings), systemStatus (string), priorityItems (array), nextSteps (array)`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm inspection report writer. Only report observed facts, never conclusions about cause or origin. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "report_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              executiveSummary: { type: "array", items: { type: "string" } },
              systemStatus: { type: "string" },
              priorityItems: { type: "array", items: { type: "string" } },
              nextSteps: { type: "array", items: { type: "string" } }
            },
            required: ["executiveSummary", "systemStatus", "priorityItems", "nextSteps"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return { ...JSON.parse(content), stats, deficiencyCount: deficiencies.length };
  }),
  
  // Photo note helper
  generatePhotoCaption: technicianProcedure.input(z.object({
    label: z.string(),
    deviceType: z.string().optional(),
    context: z.string().optional(),
  })).mutation(async ({ input }) => {
    const prompt = `Generate a short, professional caption and inspection note for a photo labeled "${input.label}"${input.deviceType ? ` of a ${input.deviceType}` : ''}${input.context ? `. Context: ${input.context}` : ''}.

Format your response as JSON with keys: caption (short, 10 words max), inspectionNote (detailed, 1-2 sentences)`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm inspection assistant. Generate concise, professional photo captions. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "photo_caption",
          strict: true,
          schema: {
            type: "object",
            properties: {
              caption: { type: "string" },
              inspectionNote: { type: "string" }
            },
            required: ["caption", "inspectionNote"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return JSON.parse(content);
  }),
  
  // QA check for admin
  /**
   * Pre-publish AI inspection quality review.
   * Callable by technicians (pre-finalize) and admins (post-submit audit).
   * Returns structured issues with severity: "warning" | "blocker".
   * Persists result to ai_reviews table.
   */
  prePublishReview: technicianProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });

    const site = await db.getSiteById(job.siteId);
    const allDevices = await db.getDevicesBySite(job.siteId);
    const results = await db.getInspectionResultsByJob(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);

    // ── Build compact summary ───────────────────────────────────────────────

    // Stats by device category
    const resultByDevice = new Map(results.map(r => [r.deviceId, r]));
    const catStats = new Map<string, { total: number; pass: number; fail: number; notTested: number; na: number }>();
    for (const dev of allDevices) {
      const cat = dev.category || 'UNKNOWN';
      if (!catStats.has(cat)) catStats.set(cat, { total: 0, pass: 0, fail: 0, notTested: 0, na: 0 });
      const s = catStats.get(cat)!;
      s.total++;
      const r = resultByDevice.get(dev.id);
      if (!r || r.result === 'not_tested') s.notTested++;
      else if (r.result === 'pass') s.pass++;
      else if (r.result === 'fail') s.fail++;
      else if (r.result === 'na') s.na++;
    }

    const PROBLEM_NOTE_RE = /attention|concern|issue|problem|repair|check|inspect|replace|broken|damage|crack|worn|missing|leak|corrod/i;

    // Problematic device details (capped for token budget)
    const problematic = allDevices
      .filter(dev => {
        const r = resultByDevice.get(dev.id);
        if (!r || r.result === 'not_tested') return true;
        if (r.result === 'fail') return true;
        if (r.result === 'pass' && r.notes && PROBLEM_NOTE_RE.test(r.notes)) return true;
        return false;
      })
      .slice(0, 35);

    const summaryLines = Array.from(catStats.entries())
      .map(([cat, s]) => `  ${cat}: ${s.total} total, ${s.pass} pass, ${s.fail} fail, ${s.notTested} not_tested, ${s.na} na`)
      .join('\n');

    const deviceLines = problematic.map(dev => {
      const r = resultByDevice.get(dev.id);
      const result = r?.result ?? 'not_tested';
      const notes = r?.notes ? `, notes="${r.notes.slice(0, 120)}"` : '';
      return `  id=${dev.id} cat=${dev.category} type=${dev.deviceType} loc="${dev.location ?? 'unset'}" result=${result}${notes}`;
    }).join('\n');

    const defLines = deficiencies.slice(0, 20).map(d =>
      `  id=${d.id} device=${d.deviceId ?? 'site'} sev=${d.severity} title="${d.title}" desc="${(d.description ?? '').slice(0, 100)}"`
    ).join('\n');

    const systemPrompt = `You are a fire alarm inspection QA reviewer for CAN/ULC-S536 compliance.
Analyze the inspection data and return ONLY a JSON array of issues.
Each issue: {"device_id": number|null, "device_type": string, "field": string, "issue": string, "severity": "warning"|"blocker"}
Rules:
- blocker: must be fixed before report is published (missing required data, clear contradiction)
- warning: should be reviewed but tech may override with justification
- device_id null = site-level issue
- Be concise. Max 20 issues. Prioritize by severity.`;

    const userPrompt = `INSPECTION SUMMARY
Job: ${job.jobNumber} | Type: ${job.jobType} | Site: ${site?.name ?? 'Unknown'}
Date: ${job.scheduledDate ? new Date(job.scheduledDate).toDateString() : 'unset'}
Total devices: ${allDevices.length} | Results recorded: ${results.length}

DEVICE STATS BY CATEGORY:
${summaryLines}

PROBLEMATIC DEVICES (untested, failed, or pass-with-concern-note):
${deviceLines || '  none'}

DEFICIENCIES (${deficiencies.length} total):
${defLines || '  none'}

CHECKS TO PERFORM:
1. Any device with result=not_tested (blocker if required category)
2. Devices result=fail with no deficiency logged (blocker)
3. Devices result=fail with no notes (warning)
4. Devices result=pass but notes suggest a problem (warning)
5. Deficiencies with severity=critical or major but no description (blocker)
6. Inconsistent results within same device category (e.g. 1 of 12 smoke alarms untested) (warning)
7. Site-level: missing scheduledDate, job not in correct status (warning)

Return JSON array only. No prose.`;

    let parsed: { issues: { device_id: number | null; device_type: string; field: string; issue: string; severity: string }[] };
    const MODEL = "gpt-4o";

    try {
      const response = await invokeLLM({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "inspection_review",
            strict: true,
            schema: {
              type: "object",
              properties: {
                issues: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      device_id: { type: ["number", "null"] },
                      device_type: { type: "string" },
                      field: { type: "string" },
                      issue: { type: "string" },
                      severity: { type: "string", enum: ["warning", "blocker"] },
                    },
                    required: ["device_id", "device_type", "field", "issue", "severity"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["issues"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 1024,
      });

      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== 'string') throw new Error('Empty AI response');
      parsed = JSON.parse(content);
    } catch (err) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `AI review failed: ${String(err)}` });
    }

    // Persist result
    const saved = await db.createAiReview({
      jobId: input.jobId,
      issues: parsed.issues as any,
      modelUsed: MODEL,
    });

    const blockers = parsed.issues.filter(i => i.severity === 'blocker').length;
    const warnings = parsed.issues.filter(i => i.severity === 'warning').length;

    return {
      reviewId: saved.id,
      issues: parsed.issues,
      blockers,
      warnings,
      passedReview: blockers === 0,
    };
  }),

  saveReviewOverrides: technicianProcedure.input(z.object({
    reviewId: z.number(),
    dismissedIndices: z.array(z.number()),
  })).mutation(async ({ input }) => {
    const overrides = input.dismissedIndices.map(idx => ({
      issueIndex: idx,
      dismissedAt: new Date().toISOString(),
    }));
    await db.updateAiReview(input.reviewId, { overrides });
    return { ok: true };
  }),

  runQACheck: adminProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    
    const site = await db.getSiteById(job.siteId);
    const devices = await db.getDevicesBySite(job.siteId);
    const results = await db.getInspectionResultsByJob(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    const issues: string[] = [];
    
    // Check for untested devices
    const testedDeviceIds = new Set(results.map(r => r.deviceId));
    const untestedDevices = devices.filter(d => !testedDeviceIds.has(d.id));
    if (untestedDevices.length > 0) {
      issues.push(`${untestedDevices.length} device(s) not tested: ${untestedDevices.slice(0, 5).map(d => d.deviceType + ' at ' + d.location).join(', ')}${untestedDevices.length > 5 ? '...' : ''}`);
    }
    
    // Check for failed devices without deficiencies
    const failedResults = results.filter(r => r.result === 'fail');
    const deficiencyDeviceIds = new Set(deficiencies.map(d => d.deviceId).filter(Boolean));
    const failedWithoutDeficiency = failedResults.filter(r => !deficiencyDeviceIds.has(r.deviceId));
    if (failedWithoutDeficiency.length > 0) {
      issues.push(`${failedWithoutDeficiency.length} failed device(s) without deficiency records`);
    }
    
    // Check for deficiencies without photos
    for (const def of deficiencies) {
      const photos = await db.getAttachmentsByEntity('deficiency', def.id);
      if (photos.length === 0) {
        issues.push(`Deficiency "${def.title}" has no photos attached`);
      }
    }
    
    // Check for missing notes on failed devices
    const failedWithoutNotes = failedResults.filter(r => !r.notes || r.notes.trim() === '');
    if (failedWithoutNotes.length > 0) {
      issues.push(`${failedWithoutNotes.length} failed device(s) without inspection notes`);
    }
    
    // Check job completion
    if (job.status !== 'completed' && results.length === devices.length) {
      issues.push('All devices tested but job not marked as completed');
    }
    
    return {
      jobId: input.jobId,
      siteName: site?.name,
      totalDevices: devices.length,
      testedDevices: results.length,
      deficienciesCount: deficiencies.length,
      issues,
      passedQA: issues.length === 0
    };
  }),
});

export { aiRouter };
