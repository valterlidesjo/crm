import type { Meeting, MeetingAttendee } from "@crm/shared";
import i18n from "@/i18n";
import type { GoogleCalendarEvent } from "../hooks/use-google-calendar";

/**
 * Convert Google Calendar event to CRM meeting format
 */
export function googleEventToMeeting(
  event: GoogleCalendarEvent,
  existingMeeting?: Meeting
): Omit<Meeting, "id" | "createdAt" | "updatedAt"> {
  const startTime = event.start.dateTime || `${event.start.date}T00:00:00`;
  const endTime = event.end.dateTime || `${event.end.date}T23:59:59`;
  const allDay = !event.start.dateTime;

  return {
    // Preserve CRM-specific fields from existing meeting
    customerId: existingMeeting?.customerId,
    dealId: existingMeeting?.dealId,
    contactId: existingMeeting?.contactId,
    notes: existingMeeting?.notes,
    outcome: existingMeeting?.outcome,

    // Fields from Google Calendar
    title: event.summary || i18n.getFixedT(null, "meetings")("untitled"),
    description: event.description,
    location: event.location,
    startTime,
    endTime,
    allDay,
    googleCalendarEventId: event.id,
    googleCalendarLink: event.htmlLink,
    attendees:
      event.attendees?.map((a) => ({
        email: a.email,
        name: a.displayName,
        responseStatus: a.responseStatus as MeetingAttendee["responseStatus"],
      })) || [],
    sendNotifications: true,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Determine if a Google Calendar event needs to be synced to Firestore
 */
export function needsSync(
  event: GoogleCalendarEvent,
  existingMeeting?: Meeting
): boolean {
  if (!existingMeeting) return true;
  if (!existingMeeting.syncedAt) return true;

  // Compare event update time with last sync
  const eventUpdated = new Date(event.updated || 0).getTime();
  const lastSync = new Date(existingMeeting.syncedAt).getTime();

  return eventUpdated > lastSync;
}

/**
 * Sync result tracking
 */
export interface SyncResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  errors: Array<{ eventId: string; error: string }>;
}

/**
 * Create an empty sync result
 */
export function emptySyncResult(): SyncResult {
  return {
    created: [],
    updated: [],
    unchanged: [],
    errors: [],
  };
}
