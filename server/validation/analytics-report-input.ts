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

export const analyticsReportSettingsSchema = z.object({
  enabled: z.boolean(),
  schedule: z.enum(analyticsReportScheduleValues),
  timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(100).refine(validTimezone, 'Invalid IANA timezone'),
  dayOfWeek: z.enum(analyticsReportWeekdayValues).optional().default('mon')
}).strip()
