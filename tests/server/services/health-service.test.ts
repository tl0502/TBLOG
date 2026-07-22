import { createHealthService } from '../../../server/services/health-service'

describe('health service', () => {
  it('reports ready after the repository probe succeeds', async () => {
    const probe = vi.fn().mockResolvedValue(undefined)
    const service = createHealthService({ healthRepository: { probe } })

    await expect(service.checkReadiness()).resolves.toEqual({ status: 'ok' })
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('maps database failures to a safe service-unavailable domain error', async () => {
    const service = createHealthService({
      healthRepository: { probe: vi.fn().mockRejectedValue(new Error('secret binding detail')) }
    })

    await expect(service.checkReadiness()).rejects.toMatchObject({
      code: 'service_unavailable',
      message: 'Service unavailable',
      statusCode: 503,
      details: {}
    })
  })
})
