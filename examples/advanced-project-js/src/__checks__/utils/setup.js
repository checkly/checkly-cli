/*@global request */

/**
 * This setup script example shows how you can import other files, use async functions and instrument the globals
 * that are available during runtime, such as the request.
 *
 * For more info see: https://www.checklyhq.com/docs/api-checks/setup-teardown-scripts/#setup-scripts
 */

const { getToken } = require('./auth-client');

async function setup() {
  const token = await getToken();
  request.headers['X-My-Auth-Header'] = token;
}

setup();
