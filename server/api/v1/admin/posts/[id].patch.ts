import { getRouterParam, readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createAdminPostServiceForEvent } from '../../../../services/admin-post-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { postIdParamSchema, updatePostInputSchema } from '../../../../validation/admin-post-input'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const id = postIdParamSchema.parse(getRouterParam(event, 'id'))
    const { status, featured, ...fields } = updatePostInputSchema.parse(await readBody(event))
    const service = createAdminPostServiceForEvent(event)

    if (featured !== undefined) {
      await service.validateFeaturedChange(id, featured, status)
    }

    // Apply field/markdown updates first so a same-request publish sees fresh processed output.
    if (Object.keys(fields).length > 0) {
      await service.update(id, fields)
    }
    if (status !== undefined) {
      await service.changeStatus(id, status)
    }
    if (featured !== undefined) {
      await service.changeFeatured(id, featured)
    }

    return ok(await service.getForEdit(id))
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid post input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
