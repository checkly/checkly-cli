import { test, expect } from '@playwright/test'

const baseUrl = 'https://api.spacexdata.com/v3'

test('space-x dragon capsules', async ({ request }) => {
  /**
   * Get all SpaceX Dragon Capsules
   */
  const [first] = await test.step('get all capsules', async () => {
    const response = await request.get(`${baseUrl}/dragons`)
    expect(response).toBeOK()

    const data = await response.json()
    expect(data.length).toBeGreaterThan(0)

    return data
  })

  /**
   * Get a single Dragon Capsule
   */
  await test.step('get single dragon capsule', async () => {
    const response = await request.get(`${baseUrl}/dragons/${first.id}`)
    expect(response).toBeOK()

    const dragonCapsule = await response.json()
    expect(dragonCapsule.name).toEqual(first.name)
  })
})
