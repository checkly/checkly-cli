// This auth client is a stub of the script you'd want to run to retrieve an
// auth token. Read more about authentication in API monitors here: https://www.checklyhq.com/docs/detect/synthetic-monitoring/api-checks/examples/#user-authentication-apis

export async function getToken() {
  console.log('Fetching a token from an imaginary auth API endpoint')
  const token = await new Promise((resolve) => resolve('123abc'))
  return token
}
