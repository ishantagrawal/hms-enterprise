export function isEventCompleted(event) {
  if (typeof event.is_completed === 'boolean') return event.is_completed;
  if (String(event.status || '').toLowerCase() === 'completed') return true;
  if (String(event.status || '').toLowerCase() !== 'approved') return false;

  const scheduledEnd = Date.parse(`${event.date}T${event.end_time}`);
  return Number.isFinite(scheduledEnd) && scheduledEnd <= Date.now();
}
