import { getRouterParam, isError, readBody, setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../../domain/domain-error'
import { integrationError } from '../../../../../domain/integration-errors'
import { createIntegrationServiceForEvent } from '../../../../../services/integration-service-factory'
import { errorResponse, ok } from '../../../../../utils/api-response'
import { requireAdmin } from '../../../../../utils/require-admin'
import {
  integrationCapabilityParamSchema,
  integrationProviderParamSchema,
  updateIntegrationInputSchema
} from '../../../../../validation/integration-input'

function parseCapability(value: string | undefined): string {
  try {
    return integrationCapabilityParamSchema.parse(value)
  } catch {
    throw integrationError('provider_not_found', 'Integration provider not found', 404)
  }
}

function parseProvider(value: string | undefined): string {
  try {
    return integrationProviderParamSchema.parse(value)
  } catch {
    throw integrationError('provider_not_found', 'Integration provider not found', 404)
  }
}

async function parseUpdateInput(event: H3Event) {
  try {
    return updateIntegrationInputSchema.parse(await readBody(event))
  } catch (error) {
    if (error instanceof ZodError || (isError(error) && error.statusCode === 400)) {
      throw new DomainError(
        'validation_failed',
        'Invalid integration input',
        422,
        error instanceof ZodError ? { issues: error.issues } : {}
      )
    }
    throw error
  }
}

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    const capability = parseCapability(getRouterParam(event, 'capability'))
    const provider = parseProvider(getRouterParam(event, 'provider'))
    const input = await parseUpdateInput(event)
    const view = await createIntegrationServiceForEvent(event).update(
      capability,
      provider,
      input,
      current.permissions
    )

    return ok(view)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
