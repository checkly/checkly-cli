import { test, expect } from '@playwright/test'

const baseUrl = 'https://api.spacexdata.com/v3'

test('space-x dragon capsules', async ({ request }) => {
  /**
   * Get all SpaceX Dragon Capsules
   */
  const response = await test.step('get all capsules', async () => {
    return request.get(`${baseUrl}/dragons`)
  })

  expect(response).toBeOK()

  const data = await response.json()
  expect(data.length).toBeGreaterThan(0)

  const [first] = data

  /**
   * Get a single Dragon Capsule
   */
  const getSingleResponse = await test.step('get single dragon capsule', async () => {
    return request.get(`${baseUrl}/dragons/${first.id}`)
  })

  expect(getSingleResponse).toBeOK()

  const dragonCapsule = await getSingleResponse.json()
  expect(dragonCapsule.name).toEqual(first.name)
})
