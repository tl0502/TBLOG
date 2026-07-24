import { z } from 'zod'
import {
  analyticsReportScheduleValues,
  analyticsReportWeekdayValues
} from '../domain/analytics-report'

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** Normalize HTML time inputs that may include seconds (`HH:mm:ss`) to stored `HH:mm`. */
function normalizeTimeOfDay(value: string): string {
  const match = /^(?:([01]\d|2[0-3]):([0-5]\d))(?::[0-5]\d)?$/.exec(value.trim())
  return match ? `${match[1]}:${match[2]}` : value.trim()
}

export const analyticsReportSettingsSchema = z.object({
  enabled: z.boolean(),
  schedule: z.enum(analyticsReportScheduleValues),
  timeOfDay: z.string().transform(normalizeTimeOfDay).pipe(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)),
  timezone: z.string().trim().min(1).max(100).refine(validTimezone, 'Invalid IANA timezone'),
  dayOfWeek: z.enum(analyticsReportWeekdayValues).optional().default('mon')
}).strip()
