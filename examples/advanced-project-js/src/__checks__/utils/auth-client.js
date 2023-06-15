export async function getToken() {
  console.log('Fetching a token from an imaginary auth API endpoint');
  const token = await new Promise((resolve) => resolve('123abc'));
  return token;
}
