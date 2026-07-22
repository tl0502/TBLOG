import { getRouterParam, setResponseHeader, setResponseStatus } from 'h3'
import { integrationError } from '../../../../../../../domain/integration-errors'
import { createIntegrationServiceForEvent } from '../../../../../../../services/integration-service-factory'
import { errorResponse, ok } from '../../../../../../../utils/api-response'
import { requireAdmin } from '../../../../../../../utils/require-admin'
import {
  integrationActionParamSchema,
  integrationCapabilityParamSchema,
  integrationProviderParamSchema
} from '../../../../../../../validation/integration-input'

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

function parseAction(value: string | undefined): string {
  try {
    return integrationActionParamSchema.parse(value)
  } catch {
    throw integrationError('action_not_found', 'Integration action not found', 404)
  }
}

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    const capability = parseCapability(getRouterParam(event, 'capability'))
    const provider = parseProvider(getRouterParam(event, 'provider'))
    const action = parseAction(getRouterParam(event, 'action'))
    const view = await createIntegrationServiceForEvent(event).runAction(
      capability,
      provider,
      action,
      current.permissions
    )

    return ok(view)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
