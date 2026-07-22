import { setResponseHeader, setResponseStatus } from 'h3'
import { createSeoFeedServiceForEvent } from '../services/seo-feed-service-factory'
import { setPublicNoStoreHeaders } from '../utils/public-cache'

// Served at /rss.xml. 404s (plain text) when RSS is disabled in SEO settings.
export default defineEventHandler(async (event) => {
  const feed = await createSeoFeedServiceForEvent(event).getRssFeed()
  if (!feed) {
    setResponseStatus(event, 404)
    setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return 'RSS feed is disabled'
  }
  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setPublicNoStoreHeaders(event)
  return feed.xml
})
