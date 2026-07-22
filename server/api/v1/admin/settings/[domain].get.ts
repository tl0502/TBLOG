import { getRouterParam, setResponseStatus } from 'h3'
import { createSettingsServiceForEvent } from '../../../../services/settings-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const domain = getRouterParam(event, 'domain') ?? ''
    const service = createSettingsServiceForEvent(event)
    if (domain === 'profile') {
      const snapshot = await service.getProfileSnapshot()
      return ok(snapshot.value, { domain, revision: snapshot.revision })
    }
    const settings = await service.getDomain(domain as never)
    return ok(settings, { domain })
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
