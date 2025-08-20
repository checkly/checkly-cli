import { test, expect } from '@playwright/test'

// Multistep checks let you make multiple API calls in sequence. Rather than
// a simple API check configuration, multistep checks use Playwright allowing
// chained API requests. Read more at: https://www.checklyhq.com/docs/multistep-checks/

// Note: in this demo there is no *.check.ts file that configures this check.
// as a result its logical ID will just be this check's file name.

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
