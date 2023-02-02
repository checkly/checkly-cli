import axios from 'axios'
import * as os from 'os'
import * as http from 'http'
import * as crypto from 'crypto'
import EventEmitter = require('events')
import { AddressInfo } from 'net'

const AUTH0_CLIENT_ID = 'mBtwLFVm39GVZ1HpSRBSdRiLFucYxmMb'

export const generateAuthenticationUrl = (codeChallenge: string, scope: string, state: string, redirect_uri: string) => {
  const url = new URL('https://auth.checklyhq.com/authorize')
  const params = new URLSearchParams({
    client_id: AUTH0_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    redirect_uri,
    scope,
    state,
  })

  url.search = params.toString()
  return url.toString()
}

export function generatePKCE () {
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

export function startServer (codeVerifier: string): Promise<{ authListener: EventEmitter, serverUri: string }> {
  const server = http.createServer()
  const authListener = new EventEmitter()
  server.on('request', (req, res) => {
  // `req.url` has a '/' char at the beginning which needs removed to be valid searchParams input
    if (!req.url?.includes('favicon.ico')) {
      const responseParams = new URLSearchParams(req.url?.substring(1))
      const code = responseParams.get('code')
      const state = responseParams.get('state')

      const error = responseParams.get('error')
      const errorDescription = responseParams.get('error_description')

      if (code && state === codeVerifier) {
        res.write(`
    <html>
    <body>
      <div style="height:100%;width:100%;inset:0;position:absolute;display:grid;place-items:center;background-color:#EFF2F7;text-align:center;font-family:Inter;">
        <h3 style="font-weight: 200;"><strong style="color:#45C8F1;">@checkly/cli</strong> login success! </br></br>You can go back to your terminal</br></br>This window should close itself in 3 seconds.</h3>
      </div>
      <script>setTimeout(function() {window.close()}, 3000);</script>
    </body>
    </html>
  `)
        authListener.emit('successful-auth', code)
      } else {
        res.write(`
    <html>
    <body>
      <div style="height:100%;width:100%;inset:0;position:absolute;display:grid;place-items:center;background-color:#EFF2F7;text-align:center;font-family:Inter;">
        <h3 style="font-weight:200;">Login failed, please try again!</h3>
        <p>
          <b>${error}</b>: ${errorDescription}
        </p>
      </div>
    </body>
    </html>
  `)
        authListener.emit('error')
      }

      res.end()
    }
  })
  return new Promise((resolve, reject) => {
    server.on('listening', () => {
      const addressInfo = <AddressInfo> server.address()
      resolve({ authListener, serverUri: `http://localhost:${addressInfo.port}` })
    })
    server.on('error', err => {
      // TODO: Update error handling to not have a console.log here.
      // eslint-disable-next-line no-console
      console.log('Unable to start an HTTP server on port 4242.', err)
      reject(err)
    })
    server.listen(0)
  })
}

export async function getAccessToken (code: string, codeVerifier: string, redirect_uri: string) {
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: AUTH0_CLIENT_ID,
    code_verifier: codeVerifier,
    code,
    redirect_uri,
  })

  const tokenResponse = await axios.post(
    'https://auth.checklyhq.com/oauth/token',
    tokenParams,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Encoding': '*',
      },
    },
  )

  return tokenResponse.data
}

// TODO: Move this to API SDK
export async function getApiKey ({ accessToken, baseHost }: {accessToken: string, baseHost: string}) {
  const { data } = await axios.post(
      `${baseHost}/users/me/api-keys?name=${
        'CLI User Key (' + os.hostname() + ')'
      }`,
      null,
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Authorization: `Bearer ${accessToken}`,
        },
      },
  )
  return data
}
