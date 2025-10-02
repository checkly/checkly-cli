const { test, expect } = require('@playwright/test')

// Multistep checks let you make multiple API calls in sequence. Rather than
// a simple API check configuration, multistep checks use Playwright allowing
// chained API requests. Read more at: https://www.checklyhq.com/docs/multistep-checks/


const baseUrl = 'https://api.spacexdata.com/v3'

test('space-x capsules', async ({ request }) => {

  const [first] = await test.step('get all Dragon capsules', async () => {
    const response = await request.get(`${baseUrl}/dragons`)
    expect(response).toBeOK()

    const data = await response.json()
    expect(data.length).toBeGreaterThan(0)

    return data
  })

  await test.step('get single dragon capsule', async () => {
    const response = await request.get(`${baseUrl}/dragons/${first.id}`)
    expect(response).toBeOK()

    const dragonCapsule = await response.json()
    expect(dragonCapsule.name).toEqual(first.name)
  })
})
