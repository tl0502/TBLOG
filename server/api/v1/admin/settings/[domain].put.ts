import { getRequestHeader, getRouterParam, readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { isSettingsDomain, type ProfileSettings } from '../../../../domain/settings'
import { settingsError } from '../../../../domain/settings-errors'
import { createSettingsServiceForEvent } from '../../../../services/settings-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { parseSettingsInput } from '../../../../validation/settings-input'

function settingsRevision(event: Parameters<typeof getRequestHeader>[0]): number | null | undefined {
  const raw = getRequestHeader(event, 'x-settings-revision')
  if (raw === undefined) return undefined
  if (raw === 'none') return null
  if (!/^\d+$/.test(raw)) {
    throw settingsError('validation_failed', 'Invalid settings revision', 400)
  }
  const revision = Number(raw)
  if (!Number.isSafeInteger(revision)) {
    throw settingsError('validation_failed', 'Invalid settings revision', 400)
  }
  return revision
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const domain = getRouterParam(event, 'domain') ?? ''
    // Reject unknown domains before parsing so we never index the schema map with an invalid key.
    if (!isSettingsDomain(domain)) {
      throw settingsError('invalid_domain', `Unknown settings domain "${domain}"`, 404)
    }
    const input = parseSettingsInput(domain, await readBody(event))
    const service = createSettingsServiceForEvent(event)
    const expectedRevision = settingsRevision(event)
    if (domain === 'profile' && expectedRevision !== undefined) {
      const result = await service.updateProfile(input as ProfileSettings, expectedRevision)
      return ok(result.value, { domain, revision: result.revision })
    }
    const settings = await service.updateDomain(domain, input)
    const meta = domain === 'profile'
        ? { domain, revision: (await service.getProfileSnapshot()).revision }
        : { domain }

    return ok(settings, meta)
  } catch (error) {
    const mapped = error instanceof ZodError
      ? settingsError('validation_failed', 'Invalid settings input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
