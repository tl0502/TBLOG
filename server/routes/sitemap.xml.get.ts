import { setResponseHeader, setResponseStatus } from 'h3'
import { createSeoFeedServiceForEvent } from '../services/seo-feed-service-factory'
import { setPublicNoStoreHeaders } from '../utils/public-cache'

// Served at /sitemap.xml. 404s (plain text) when the sitemap is disabled in SEO settings.
export default defineEventHandler(async (event) => {
  const sitemap = await createSeoFeedServiceForEvent(event).getSitemap()
  if (!sitemap) {
    setResponseStatus(event, 404)
    setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return 'Sitemap is disabled'
  }
  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setPublicNoStoreHeaders(event)
  return sitemap.xml
})
