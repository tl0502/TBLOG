import { getQuery, getRouterParam, setResponseHeader, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { commentError } from '../../../../domain/comment-errors'
import { createCommentServiceForEvent } from '../../../../services/comment-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { slugParamSchema } from '../../../../validation/public-read-input'
import { publicCommentListQuerySchema } from '../../../../validation/comment-input'

function parsePublicArticleSlug(value: string | undefined): string {
  try {
    return slugParamSchema.parse(value)
  } catch {
    throw commentError('not_found', 'Post not found', 404)
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  try {
    const slug = parsePublicArticleSlug(getRouterParam(event, 'slug'))
    const query = publicCommentListQuerySchema.parse(getQuery(event))
    const page = await (await createCommentServiceForEvent(event)).listPublic(slug, query)
    return ok(page.items, { nextCursor: page.nextCursor })
  } catch (error) {
    const mapped = error instanceof ZodError
      ? commentError('invalid_pagination', 'Invalid comment pagination query', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
