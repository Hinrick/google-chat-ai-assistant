const { google } = require('googleapis');
const { getDWDClient, getDefaultUser } = require('./google-auth');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

async function getCalendarClient(userEmail) {
  const email = userEmail || getDefaultUser();
  const auth = getDWDClient(email, SCOPES);
  return google.calendar({ version: 'v3', auth });
}

async function createCalendarEvent({ title, description, startDate, endDate, userEmail }) {
  try {
    const client = await getCalendarClient(userEmail);

    // For all-day events, end date is exclusive in Google Calendar API
    // So if task runs 3/7-3/9, calendar end should be 3/10
    const endExclusive = new Date(endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const endStr = endExclusive.toISOString().split('T')[0];

    const event = {
      summary: title,
      start: { date: startDate },
      end: { date: endStr },
    };

    if (description) event.description = description;

    const res = await client.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    console.log(`[GCAL] Created event "${title}" (${startDate} ~ ${endDate}) for ${userEmail || 'default'}`);
    return res.data.id;
  } catch (err) {
    console.error(`[GCAL] Failed to create event "${title}":`, err.message);
    return null;
  }
}

async function deleteCalendarEvent({ googleEventId, userEmail }) {
  if (!googleEventId) return;
  try {
    const client = await getCalendarClient(userEmail);
    await client.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    });
    console.log(`[GCAL] Deleted event ${googleEventId}`);
  } catch (err) {
    console.error(`[GCAL] Failed to delete event:`, err.message);
  }
}

async function updateCalendarEventStatus({ googleEventId, userEmail, title }) {
  if (!googleEventId) return;
  try {
    const client = await getCalendarClient(userEmail);
    await client.events.patch({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: {
        summary: `[Done] ${title}`,
        colorId: '2', // sage/green
      },
    });
    console.log(`[GCAL] Marked event "${title}" as done`);
  } catch (err) {
    console.error(`[GCAL] Failed to update event:`, err.message);
  }
}

module.exports = { createCalendarEvent, deleteCalendarEvent, updateCalendarEventStatus };
