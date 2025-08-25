// This auth client is a stub of the script you'd want to run to retrieve an
// auth token. Read more about authentication in API monitors here: https://www.checklyhq.com/docs/api-checks/setup-script-examples/

export async function getToken (): Promise<string> {
  console.log('Fetching a token from an imaginary auth API endpoint')
  const token: string = await new Promise(resolve => { return resolve('123abc') })
  return token
}
