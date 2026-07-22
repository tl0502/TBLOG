import { setResponseStatus } from 'h3'
import { createSettingsServiceForEvent } from '../../services/settings-service-factory'
import { errorResponse, ok } from '../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../utils/public-cache'

export default defineEventHandler(async (event) => {
  try {
    const config = await createSettingsServiceForEvent(event).getPublicSiteConfig()
    // The app owns one shared request state. Dynamic response caching stays disabled so an explicit
    // refresh cannot receive a stale provider/site projection from a shared HTTP cache.
    setPublicNoStoreHeaders(event)
    return ok(config)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
