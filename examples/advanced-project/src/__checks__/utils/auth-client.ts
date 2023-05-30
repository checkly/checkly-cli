/* eslint-disable no-console */
export async function getToken (): Promise<string> {
  console.log('Fetching a token from an imaginary auth API endpoint')
  const token: string = await new Promise(resolve => resolve('123abc'))
  return token
}
