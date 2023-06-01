const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
await sleep(10000)
