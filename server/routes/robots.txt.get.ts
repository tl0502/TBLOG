import { setResponseHeader } from 'h3'
import { createSeoFeedServiceForEvent } from '../services/seo-feed-service-factory'
import { setPublicNoStoreHeaders } from '../utils/public-cache'

// Served at /robots.txt. Always responds; crawl rules derive from the SEO robots policy.
export default defineEventHandler(async (event) => {
  const robots = await createSeoFeedServiceForEvent(event).getRobotsTxt()
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setPublicNoStoreHeaders(event)
  return robots.text
})
