import axios, { type AxiosError } from 'axios'
import * as os from 'os'
import * as http from 'http'
import * as crypto from 'crypto'
import jwtDecode from 'jwt-decode'
import { getDefaults as getApiDefaults } from '../rest/api'
import * as fs from 'fs'
import * as path from 'path'

export type AuthMode = 'signup' | 'login'

const AUTH0_CLIENT_ID = 'mBtwLFVm39GVZ1HpSRBSdRiLFucYxmMb'
const AUTH0_AUTHORIZATION_URL = 'https://auth.checklyhq.com/authorize'
const AUTH0_SCOPES = 'openid profile email'
const AUTH0_CALLBACK_URL = 'http://localhost:4242'

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

export class AuthContext {
  authenticationUrl: string

  #codeChallenge: string
  #codeVerifier: string

  #accessToken?: string
  #idToken?: string

  constructor (private mode: AuthMode) {
    const { codeChallenge, codeVerifier } = generatePKCE()
    this.#codeChallenge = codeChallenge
    this.#codeVerifier = codeVerifier

    this.authenticationUrl = this.#generateAuthenticationUrl()
  }

  async getAuth0Credentials () {
    await this.#fetchAccessToken()

    if (!this.#accessToken || !this.#idToken) {
      throw new Error('There was an unexpected error retrieving Auth0 token. Please try again or contact ' +
          'support@checklyhq.com if this problem persists')
    }

    const { name } = jwtDecode<any>(this.#idToken)

    const { key } = await this.#getApiKey()

    return {
      name,
      key,
    }
  }

  #generateAuthenticationUrl () {
    const url = new URL(AUTH0_AUTHORIZATION_URL)

    const params = new URLSearchParams({
      client_id: AUTH0_CLIENT_ID,
      code_challenge: this.#codeChallenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      redirect_uri: AUTH0_CALLBACK_URL,
      scope: AUTH0_SCOPES,
      state: this.#codeVerifier,
      mode: this.mode === 'signup' ? 'signUp' : '',
      allowLogin: this.mode === 'signup' ? 'false' : 'true',
      allowSignUp: this.mode === 'signup' ? 'true' : 'false',
    })

    url.search = params.toString()
    return url.toString()
  }

  #startServer (): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer()
      server.on('request', (req, res) => {
        if (req.url?.endsWith('.svg')) {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml' })

          fs.readFile(path.join(__dirname, `.${req.url}`), 'utf8', (err, data) => {
            if (!err) res.end(data)
          })

        // `req.url` has a '/' char at the beginning which needs removed to be valid searchParams input
        } else if (!req.url?.includes('favicon.ico')) {
          const responseParams = new URLSearchParams(req.url?.substring(1))
          const code = responseParams.get('code')
          const state = responseParams.get('state')

          const error = responseParams.get('error')
          const errorDescription = responseParams.get('error_description')

          if (code && state === this.#codeVerifier) {
            res.write(`
        <html>
            <style>
              html {
                font-family: Inter, system-ui, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif;
                font-size: 16px;
              }
              @keyframes slide-in-top {
                0% {
                  transform: translateY(-100px);
                  opacity: 0;
                }
                100% {
                  transform: translateY(0);
                  opacity: 1;
                }
              }
              .slide-in {
                animation: slide-in-top 1s cubic-bezier(0.230, 1.000, 0.320, 1.000) both;
              }
            </style>
        <body>
          <div style="height:100%;width:100%;inset:0;position:absolute;display:grid;place-items:center;background-color:#EFF2F7;text-align:center;">
            <div>
              <img class="slide-in" src="./assets/success_raccoon.svg" style="width: 140px; height: 140px;">
              <h3 style="font-size: 28px; font-weight: 600; margin-bottom: 3rem; margin-top: .5rem;">Successfully logged in</h3>
              <div style="font-weight: 500;">
                <div style="margin-bottom: 1rem;">You can go back to your terminal.</div>
                <div>This window should close itself in 3 seconds.</div>
              </div>
            </div>
          </div>
          <script>setTimeout(function() {window.close()}, 3000);</script>
        </body>
        </html>
      `)
            resolve(code)
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
          }

          res.end()
        }
      })

      server.listen(4242).on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error('Unable to start a local server on port 4242.' +
            ' Please check that `checkly login` isn\'t already running in a separate tab.' +
            ' On OS X and Linux, you can run `lsof -i :4242` to see which process is blocking the port.'))
        } else {
          reject(err)
        }
      })
    })
  }

  async #fetchAccessToken () {
    const code = await this.#startServer()

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: AUTH0_CLIENT_ID,
      code_verifier: this.#codeVerifier,
      code,
      redirect_uri: AUTH0_CALLBACK_URL,
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

    const { access_token: accessToken, id_token: idToken } = tokenResponse.data

    this.#accessToken = accessToken
    this.#idToken = idToken
  }

  async #getApiKey () {
    try {
      await this.#fetchUser()
    } catch (error: unknown) {
      if ((error as AxiosError).response?.status === 401) {
        await this.#registerUser()
      } else {
        throw error
      }
    }

    const apiKeyName = `CLI User Key (${os.hostname()})`

    const { data } = await this.#axiosInstance.post(`/users/me/api-keys?name=${apiKeyName}`)

    return data
  }

  async #fetchUser () {
    const { data } = await this.#axiosInstance.get('/users/me')

    return data
  }

  async #registerUser () {
    const { data } = await this.#axiosInstance.post('/users/', { accessToken: this.#accessToken })

    return data
  }

  get #axiosInstance () {
    // Keep axios instance stateless
    return axios.create({
      baseURL: getApiDefaults().baseURL,
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${this.#accessToken}`,
      },
    })
  }
}
