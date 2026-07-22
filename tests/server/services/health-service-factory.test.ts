import { createHealthServiceForEvent } from '../../../server/services/health-service-factory'

describe('health service factory', () => {
  it('normalizes a missing D1 binding through the health service', async () => {
    const service = createHealthServiceForEvent({ context: {} } as never)

    await expect(service.checkReadiness()).rejects.toMatchObject({
      code: 'service_unavailable',
      statusCode: 503
    })
  })
})
