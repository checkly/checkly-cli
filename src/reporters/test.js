const ListReporter = require('./list')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main () {
  const listReporter = new ListReporter()
  listReporter.onBegin([
    { name: 'Check 1' },
    { name: 'Check 2' },
    { name: 'Check 3' },
    { name: 'Check 4' },
    { name: 'Check 5' },
  ])

  await sleep(2000)

  listReporter.onCheckEnd({ name: 'Check 1', hasFailures: true })

  await sleep(1000)
  listReporter.onCheckEnd({ name: 'Check 2', hasFailures: false })

  await sleep(1000)
  listReporter.onCheckEnd({ name: 'Check 3', hasFailures: false })

  await sleep(1000)
  listReporter.onCheckEnd({ name: 'Check 4', hasFailures: false })

  await sleep(1000)
  listReporter.onCheckEnd({ name: 'Check 5', hasFailures: true })
}

main()
  .then(() => {})
  .catch((err) => console.error('Got error ', err))
