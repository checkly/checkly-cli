const http = require('http')
const crypto = require('crypto')
const consola = require('consola')
const axios = require('axios')

// TODO: Move this to ./sdk
const AUTH0_DOMAIN = 'checkly'
const AUTH0_CLIENT_ID = 'mBtwLFVm39GVZ1HpSRBSdRiLFucYxmMb'

const generateAuthenticationUrl = (codeChallenge, scope, state) => {
  const url = new URL(`https://${AUTH0_DOMAIN}.eu.auth0.com/authorize`)
  const params = new URLSearchParams({
    client_id: AUTH0_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    redirect_uri: 'http://localhost:4242',
    scope: scope,
    state: state,
  })

  url.search = params
  return url.toString()
}

function generatePKCE() {
  const codeVerifier = crypto
    .randomBytes(64)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return {
    codeChallenge,
    codeVerifier,
  }
}

function startServer(codeVerifier, onTokenCallback) {
  const server = http.createServer()
  server.on('request', (req, res) => {
    // `req.url` has a '/' char at the beginning which needs removed to be valid searchParams input
    if (!req.url.includes('favicon.ico')) {
      const responseParams = new URLSearchParams(req.url.substring(1))
      const code = responseParams.get('code')
      const state = responseParams.get('state')

      if (code && state === codeVerifier) {
        res.write(`
      <html>
      <body>
        <div style="height:100%;width:100%;inset:0;position:absolute;display:grid;place-items:center;background-color:#EFF2F7;text-align:center;font-family:Inter;">
          <h3 style="font-weight: 200;"><strong style="color:#45C8F1;">checkly-cli</strong> login success! </br></br>This window should close itself in 3 seconds.</h3>
        </div>
        <script>setTimeout(function() {window.close()}, 3000);</script>
      </body>
      </html>
    `)
        onTokenCallback(code)
      } else {
        res.write(`
      <html>
      <body>
        <div style="height:100%;width:100%;inset:0;position:absolute;display:grid;place-items:center;background-color:#EFF2F7;text-align:center;font-family:Inter;">
          <h3 style="font-weight:200;">Login failed, please try again!</h3>
        </div>
      </body>
      </html>
    `)
      }

      res.end()
    }
  })

  server.listen(4242, (err) => {
    if (err) {
      console.log(`Unable to start an HTTP server on port 4242.`, err)
      process.exit(1)
    }
  })
}

async function getAccessToken(code, codeVerifier) {
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: AUTH0_CLIENT_ID,
    code_verifier: codeVerifier,
    code,
    redirect_uri: `http://localhost:4242`,
  })

  const tokenResponse = await axios.post(
    `https://${AUTH0_DOMAIN}.eu.auth0.com/oauth/token`,
    tokenParams.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  )

  consola.debug(tokenResponse.data)

  return tokenResponse.data
}

async function getApiKey({ userExternalId, accessToken, baseHost, accountId }) {
  try {
    const userResponse = await axios.get(
      `${baseHost}/users/me/api-key/${encodeURIComponent(userExternalId)}${
        accountId ? `?accountId=${accountId}` : ''
      }`,
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    return userResponse.data
  } catch (err) {
    consola.debug(err.toJSON())
    consola.error(`${err} - Error communicating with Checkly backend.`)
    process.exit(1)
  }
}

module.exports = {
  generateAuthenticationUrl,
  generatePKCE,
  startServer,
  getAccessToken,
  getApiKey,
}
