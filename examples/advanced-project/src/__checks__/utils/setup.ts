import { getToken } from './auth-client'

// This setup script example shows how you can import other files, use async 
// functions and instrument the globals that are available during runtime, such as the request.
// For more info see: https://www.checklyhq.com/docs/detect/synthetic-monitoring/api-checks/set-up-and-tear-down/#setup-scripts

async function setup () {
  const token = await getToken()
  request.headers['X-My-Auth-Header'] = token
}

await setup()
