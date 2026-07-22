import { setResponseStatus } from 'h3'
import { createPublicHotspotServiceForEvent } from '../../../services/public-hotspot-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../../utils/public-cache'

export default defineEventHandler(async (event) => {
  try {
    const hotspots = await createPublicHotspotServiceForEvent(event).getHotspots()
    setPublicNoStoreHeaders(event)
    return ok(hotspots, { currentDays: 7, retentionDays: 730 })
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
