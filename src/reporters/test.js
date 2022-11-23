const ListReporter = require('./list')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main () {
  const listReporter = new ListReporter()
  const check1 = { name: 'Check 1', logicalId: 'check-1' }
  const check2 = { name: 'Check 2', logicalId: 'check-2' }
  const check3 = { name: 'Check 3', logicalId: 'check-3' }
  const check4 = { name: 'Check 4', logicalId: 'check-4' }
  const check5 = { name: 'Check 5', logicalId: 'check-5' }
  listReporter.onBegin([check1, check2, check3, check4, check5])

  listReporter.onCheckBegin(check1)
  await sleep(2000)

  listReporter.onCheckEnd({
    ...check1,
    hasFailures: true,
    logs: 'Navigating to homepage...\nAttempting signup..\nError, selector not found',
  })

  // Imagine checks 2 and 3 run concurrently...
  listReporter.onCheckBegin(check3)
  listReporter.onCheckBegin(check2)
  await sleep(1000)
  listReporter.onCheckEnd({ ...check2, hasFailures: false })

  await sleep(1000)
  listReporter.onCheckEnd({ ...check3, hasFailure: false })

  listReporter.onCheckBegin(check4)
  await sleep(1000)
  listReporter.onCheckEnd({ ...check4, hasFailures: false })

  listReporter.onCheckBegin(check5)
  await sleep(1000)
  listReporter.onCheckEnd({
    ...check5,
    hasFailures: true,
    logs: 'Error: received 404 requesting GET /users',
  })
}

main()
  .then(() => {})
  .catch((err) => console.error('Got error ', err))
