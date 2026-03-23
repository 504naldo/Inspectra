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
