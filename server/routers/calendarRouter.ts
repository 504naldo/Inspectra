import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminOrOfficeProcedure } from "../_core/trpc";
import * as db from "../db";
import { getValidGoogleToken } from "../_core/googleAuth";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type CalendarEvent = {
  id: string;
  htmlLink: string;
  status: string;
};

/**
 * Build a Google Calendar event body from job data.
 */
async function buildEventBody(jobId: number) {
  const job = await db.getJobById(jobId);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

  const site = await db.getSiteById(job.siteId);
  const customerOrg = await db.getCustomerOrgById(job.customerOrgId);

  // Get assigned technicians
  const technicians = await db.getJobTechnicians(jobId);
  let leadTech = null;
  if (job.leadTechnicianId) {
    leadTech = await db.getUserById(job.leadTechnicianId);
  }

  // Build attendee list from assigned technicians
  const attendees: { email: string; displayName?: string }[] = [];
  if (leadTech?.email) {
    attendees.push({ email: leadTech.email, displayName: leadTech.name || undefined });
  }
  if (technicians) {
    for (const tech of technicians) {
      if (tech.email && tech.email !== leadTech?.email) {
        attendees.push({ email: tech.email, displayName: tech.name || undefined });
      }
    }
  }

  // Build location string
  const locationParts: string[] = [];
  if (site?.name) locationParts.push(site.name);
  if (site?.address) locationParts.push(site.address);
  if (site?.city) locationParts.push(site.city);
  if (site?.state) locationParts.push(site.state);
  if (site?.postalCode) locationParts.push(site.postalCode);
  const location = locationParts.join(", ");

  // Build description
  const descriptionParts: string[] = [];
  descriptionParts.push(`Job: ${job.title}`);
  if (job.jobNumber) descriptionParts.push(`Job #: ${job.jobNumber}`);
  if (job.jobType) descriptionParts.push(`Type: ${job.jobType.replace(/_/g, " ")}`);
  if (customerOrg?.name) descriptionParts.push(`Customer: ${customerOrg.name}`);
  if (site?.name) descriptionParts.push(`Site: ${site.name}`);
  if (job.description) descriptionParts.push(`\nNotes: ${job.description}`);
  if (leadTech?.name) descriptionParts.push(`\nLead Technician: ${leadTech.name}`);
  descriptionParts.push(`\n---\nView in Inspectra: ${process.env.APP_URL || ""}/tech/jobs/${jobId}`);

  // Determine event date/time
  // If scheduledDate is set, use it. Default to a 4-hour block starting at 8am.
  let startDate: Date;
  if (job.scheduledDate) {
    startDate = new Date(job.scheduledDate);
    // If the date has no time component (midnight), set to 8am
    if (startDate.getHours() === 0 && startDate.getMinutes() === 0) {
      startDate.setHours(8, 0, 0, 0);
    }
  } else {
    // No scheduled date — use tomorrow at 8am
    startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(8, 0, 0, 0);
  }

  const endDate = new Date(startDate);
  endDate.setHours(startDate.getHours() + 4); // 4-hour default duration

  // Build event title
  const title = site?.name
    ? `🔥 Inspection: ${site.name}`
    : `🔥 Inspection: ${job.title}`;

  return {
    summary: title,
    location,
    description: descriptionParts.join("\n"),
    start: {
      dateTime: startDate.toISOString(),
      timeZone: "America/Toronto",
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: "America/Toronto",
    },
    attendees: attendees.length > 0 ? attendees : undefined,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },    // 1 hour before
        { method: "popup", minutes: 1440 },  // 1 day before
      ],
    },
    colorId: "11", // Red — fire inspection
  };
}

export const calendarRouter = router({
  /**
   * Create a Google Calendar event for a job.
   */
  createEvent: adminOrOfficeProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      // Check if event already exists
      const job = await db.getJobById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.googleCalendarEventId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Calendar event already exists for this job. Use update instead.",
        });
      }

      const eventBody = await buildEventBody(input.jobId);

      const response = await fetch(
        `${CALENDAR_API}/calendars/primary/events?sendUpdates=all`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error("[Calendar] Create event failed:", response.status, errorBody);
        if (response.status === 401 || response.status === 403) {
          console.error(
            "[Calendar] Permission denied — ensure the Google Calendar API is enabled in Google Cloud Console:\n" +
            "  APIs & Services → Library → Search 'Google Calendar API' → Enable"
          );
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Calendar permission denied. Please log out and log back in.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create calendar event.",
        });
      }

      const event = (await response.json()) as CalendarEvent;

      // Save the event ID to the job
      await db.updateJob(input.jobId, {
        googleCalendarEventId: event.id,
      });

      return {
        success: true,
        eventId: event.id,
        htmlLink: event.htmlLink,
      };
    }),

  /**
   * Update an existing Google Calendar event when job details change.
   */
  updateEvent: adminOrOfficeProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      const job = await db.getJobById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (!job.googleCalendarEventId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No calendar event exists for this job. Create one first.",
        });
      }

      const eventBody = await buildEventBody(input.jobId);

      const response = await fetch(
        `${CALENDAR_API}/calendars/primary/events/${job.googleCalendarEventId}?sendUpdates=all`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error("[Calendar] Update event failed:", response.status, errorBody);
        if (response.status === 404) {
          // Event was deleted from Google Calendar — clear the reference
          await db.updateJob(input.jobId, { googleCalendarEventId: null });
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Calendar event no longer exists. It may have been deleted from Google Calendar.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update calendar event.",
        });
      }

      return { success: true };
    }),

  /**
   * Delete a Google Calendar event (e.g. when job is cancelled).
   */
  deleteEvent: adminOrOfficeProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      const job = await db.getJobById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (!job.googleCalendarEventId) {
        return { success: true, message: "No calendar event to delete" };
      }

      const response = await fetch(
        `${CALENDAR_API}/calendars/primary/events/${job.googleCalendarEventId}?sendUpdates=all`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // 204 = success, 404 = already deleted, 410 = gone — all are fine
      if (!response.ok && response.status !== 404 && response.status !== 410) {
        console.error("[Calendar] Delete event failed:", response.status);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete calendar event.",
        });
      }

      // Clear the reference
      await db.updateJob(input.jobId, { googleCalendarEventId: null });

      return { success: true };
    }),

  /**
   * Check if current user has Calendar connected.
   */
  checkConnection: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const token = await getValidGoogleToken(ctx.user.id);
    return { connected: token !== null };
  }),
});
