import axios, { type AxiosError } from 'axios'
import * as os from 'os'
import * as http from 'http'
import * as crypto from 'crypto'
import jwtDecode from 'jwt-decode'
import { getDefaults as getApiDefaults } from '../rest/api'
import * as fs from 'fs'
import * as path from 'path'
import { ProxyAgent } from 'proxy-agent'

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
      throw new Error('There was an unexpected error retrieving Auth0 token. Please try again or contact '
        + 'support@checklyhq.com if this problem persists')
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
              <img class="slide-in" style="width: 140px; height: 140px;" src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODIiIGhlaWdodD0iODUiIHZpZXdCb3g9IjAgMCA4MiA4NSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTgxLjMzODUgNTIuNDMyMVYxNy42NDA2QzgxLjMzODUgNy45MDkwMyA3My40NDgxIDAuMDE4NjAwNSA2My43MTY1IDAuMDE4NjAwNUgxOC4yODA4QzguNTQ5MzIgMC4wMTg2MDA1IDAuNjU4ODg5IDcuOTA5MDMgMC42NTg4ODkgMTcuNjQwNlY1Mi40MzIxQy0wLjE4ODAxNyA3OC41NjI1IDE3Ljg0OTUgNzcuMzk3NCAyMC41MzIyIDc3LjM5NzRMNDAuOTY1OCA3OC43NDkzVjc4Ljc1NDVINDFINDEuMDM0MlY3OC43NDkzTDYxLjQ2NzggNzcuMzk3NEM2NC4xNTA1IDc3LjM5NzQgODIuMTg4IDc4LjU2NTIgODEuMzQxMSA1Mi40MzIxSDgxLjMzODVaIiBmaWxsPSIjMDA3NUZGIi8+CjxwYXRoIGQ9Ik02Ni4xOTY5IDU1LjY2NzFDNzQuMTYxIDM4LjU1MDIgNzIuNjUxMyAyNy4yNzIxIDUyLjgyNTIgNDAuOTA5NEM0OS4xMTE1IDM5LjM2NTUgNDUuNjUyOCAzOS4wNTUyIDQxLjA2MzMgMzguOTU3OEM0MS4wNTI3IDM4Ljk1NzggNDEuMDQyMiAzOC45NTc4IDQxLjAzMTcgMzguOTU3OEM0MS4wMTA3IDM4Ljk1NzggNDAuOTg5NiAzOC45NTc4IDQwLjk3MTIgMzguOTU3OEM0MC45NjA3IDM4Ljk1NzggNDAuOTUwMiAzOC45NTc4IDQwLjkzOTYgMzguOTU1MkMzNi4zNSAzOS4wNTI1IDMyLjg4ODggMzkuMzY1NSAyOS4xNzc2IDQwLjkwOTRDOS4zNDkgMjcuMjcyMSA3Ljg0MTkzIDM4LjU0NzUgMTUuODA2IDU1LjY2NzFDMTguMjgxIDYwLjA1MTYgMTIuODU3NiA2MS44Mzc1IDguMjc4NTQgNjIuNDUwM0M4LjI3NTkxIDYyLjQ1MjkgMTEuMDQ1NCA3MC45NDgzIDE3LjAwNTMgNzUuNzkwNEwyNy4yMzY2IDc4LjIxMDFMMzAuNTM3NCA3OS4yNDM3QzMwLjU2MzcgNzkuMjQzNyAzNS4xNjM4IDgwLjYyOTggMzUuODU4MiA4MC44MjQ1QzM2Ljk0NDUgODIuNTk5OCAzOC44MzgyIDgzLjk5OSA0MC45NzEyIDg0LjAyMjdDNDAuOTgxNyA4NC4wMjI3IDQwLjk5MjIgODQuMDIyNyA0MS4wMDI4IDg0LjAyMjdDNDEuMDEzMyA4NC4wMjI3IDQxLjAyMzggODQuMDIyNyA0MS4wMzQzIDg0LjAyMjdDNDMuMTcgODQuMDAxNyA0NS4wNjExIDgyLjYwNTEgNDYuMTQ3MyA4MC44MjcxQzQ2Ljg0MTcgODAuNjMyNCA1MS40NDE4IDc5LjI0OSA1MS40NjgxIDc5LjI0NjRMNTQuNzY4OSA3OC4yMTI3TDY1LjAwMDIgNzUuNzkzQzcwLjk2MDEgNzAuOTUwOSA3My43Mjk2IDYyLjQ1NTUgNzMuNzI3IDYyLjQ1MjlDNjkuMTQ1MyA2MS44NDAxIDYzLjcyNDYgNjAuMDU0MiA2Ni4xOTk1IDU1LjY2OThMNjYuMTk2OSA1NS42NjcxWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTE2LjMxMDkgMzguNzQyMkMxNi4wMDMyIDM4LjgwNzkgMTUuNjkyOCAzOC44OTc0IDE1LjQyNzIgMzkuMDY4M0MxNC41Njk4IDM5LjYyMzMgMTQuNzY5NiA0MC44OTM2IDE0Ljg0MDcgNDEuNzU5QzE0Ljk3NzQgNDMuNDEzMyAxNS4zNDA0IDQ1LjA3MjkgMTUuNzc0NCA0Ni42ODc4QzE2LjA3NjggNDcuODEzNSAxNi40NDc3IDQ4LjkyNjEgMTYuOTIxMSA0OS45OTM5QzE3LjQ1NSA0OS4xNjI4IDE4LjA0NjggNDguNDAwMSAxOC42NjQ5IDQ3LjcwMzFDMTkuMTY5OSA0Ny4xMzIzIDE5LjY5MDYgNDYuNjA2MyAyMC4yMTE0IDQ2LjEyNUMyMy4wNDkzIDQzLjUwMDEgMjUuODc0MSA0Mi4xOTU2IDI1Ljg3NDEgNDIuMTk1NkMyMy4xNDkzIDQwLjIzNjEgMTkuODI0OCAzNy45ODQ3IDE2LjMxMzUgMzguNzM5NkwxNi4zMTA5IDM4Ljc0MjJaIiBmaWxsPSIjMDAyRjY2Ii8+CjxwYXRoIGQ9Ik02NS42ODY2IDM4Ljc0MjJDNjUuOTk0MyAzOC44MDc5IDY2LjMwNDcgMzguODk3NCA2Ni41NzAzIDM5LjA2ODNDNjcuNDI3NyAzOS42MjMzIDY3LjIyNzggNDAuODkzNiA2Ny4xNTY4IDQxLjc1OUM2Ny4wMjAxIDQzLjQxMzMgNjYuNjU3MSA0NS4wNzI5IDY2LjIyMzEgNDYuNjg3OEM2NS45MjA3IDQ3LjgxMzUgNjUuNTQ5OCA0OC45MjYxIDY1LjA3NjQgNDkuOTkzOUM2NC41NDI1IDQ5LjE2MjggNjMuOTUwNyA0OC40MDAxIDYzLjMzMjYgNDcuNzAzMUM2Mi44Mjc2IDQ3LjEzMjMgNjIuMzA2OCA0Ni42MDYzIDYxLjc4NjEgNDYuMTI1QzU4Ljk0ODIgNDMuNTAwMSA1Ni4xMjM0IDQyLjE5NTYgNTYuMTIzNCA0Mi4xOTU2QzU4Ljg0ODIgNDAuMjM2MSA2Mi4xNzI3IDM3Ljk4NDcgNjUuNjgzOSAzOC43Mzk2TDY1LjY4NjYgMzguNzQyMloiIGZpbGw9IiMwMDJGNjYiLz4KPHBhdGggZD0iTTQ2LjEzNDEgODAuODA2MUM0Ni4xMjA5IDgwLjc3NzEgNDYuMTA3OCA4MC43NDU2IDQ2LjA5NDYgODAuNzE2NkM0NS41NTI4IDc5LjQ5ODkgNDQuNDQ4MSA3OC42MjMxIDQzLjIxNDYgNzguMTcwN0M0MS43ODEyIDc3LjY0NDYgNDAuMTQgNzcuNjUyNSAzOC43MDkyIDc4LjE5N0MzNy40OTkzIDc4LjY1NzIgMzYuNDM5NCA3OS41MjI2IDM1LjkwMDIgODAuNzE2NkMzNS44ODcgODAuNzQ1NiAzNS44NzM5IDgwLjc3NDUgMzUuODYwNyA4MC44MDYxQzM1Ljg1ODEgODAuODExMyAzNS44NTU1IDgwLjgxNjYgMzUuODUyOCA4MC44MjQ1QzM2LjkzOTEgODIuNTk5OCAzOC44MzI4IDgzLjk5OTEgNDAuOTY1OCA4NC4wMjI3QzQwLjk3NjQgODQuMDIyNyA0MC45ODY5IDg0LjAyMjcgNDAuOTk3NCA4NC4wMjI3QzQxLjAwNzkgODQuMDIyNyA0MS4wMTg0IDg0LjAyMjcgNDEuMDI5IDg0LjAyMjdDNDMuMTY0NiA4NC4wMDE3IDQ1LjA1NTcgODIuNjA1MSA0Ni4xNDQ2IDgwLjgyNzFDNDYuMTQyIDgwLjgyMTggNDYuMTM5MyA4MC44MTY2IDQ2LjEzNjcgODAuODA4N0w0Ni4xMzQxIDgwLjgwNjFaIiBmaWxsPSIjMDAyRjY2Ii8+CjxwYXRoIGQ9Ik0zOC4zNzI2IDYzLjA3ODlDMzcuODg4NiA2Mi41NDc2IDM3LjMyNTggNjIuMDg5OSAzNi43MTgyIDYxLjcwNTlDMzYuMDYzMyA2MS4yOTMgMzUuMzU1OCA2MC45NjE2IDM0LjYyNDYgNjAuNzA5MUMzMy44NDYxIDYwLjQ0MDggMzMuMDM2IDYwLjI2MiAzMi4yMTggNjAuMTY3M0MzMS4zNTU0IDYwLjA3IDMwLjQ4MjEgNjAuMDY3NCAyOS42MTk1IDYwLjE2MjFDMjguNzEyMSA2MC4yNTk0IDI3LjgxNTIgNjAuNDY0NSAyNi45NTUxIDYwLjc2OTZDMjYuMDM3MiA2MS4wOTU4IDI1LjE2MTQgNjEuNTM1IDI0LjM0ODcgNjIuMDcxNUMyMy40NTk3IDYyLjY2MDcgMjIuNjQ3IDYzLjM2MjkgMjEuOTI2MyA2NC4xNDkzQzIxLjEwODMgNjUuMDM4MyAyMC40MDYxIDY2LjAyOTkgMTkuODA5IDY3LjA3OTNDMTkuMTE0NyA2OC4zMDIzIDE4LjU2MjMgNjkuNjA0MyAxOC4xMjMxIDcwLjk0M0MxNy42MDUgNzIuNTIxMSAxNy4yNDQ2IDc0LjE0OTEgMTYuOTk3NCA3NS43OTA0QzE2Ljk2MDYgNzYuMDM1IDE2LjkyMzggNzYuMjY2NCAxNi44ODk2IDc2LjUxNjNDMTYuODY1OSA3Ni42NzE1IDE2LjgwMjggNzcuMDI2NSAxNi43ODE3IDc3LjI1MDFDMjEuMzc5MiA3Ny43ODQgMjUuOTc0MSA3OC40MTI2IDMwLjUyOTUgNzkuMjQzN0MzMC40NTA2IDc5LjIzMDYgMzEuMDQ1IDc2LjY2MDkgMzEuMTE4NiA3Ni40MDA2QzMxLjMxMDYgNzUuNzIyIDMxLjU0NDcgNzUuMDUxMyAzMS44NzA5IDc0LjQyNTNDMzIuMzI4NSA3My41NDQyIDMyLjk3MjkgNzIuODA3OCAzMy44MTQ1IDcyLjI3OTFDMzQuNTk4MyA3MS43ODczIDM1LjQ2ODkgNzEuNDUzMyAzNi4yODk1IDcxLjAyOThDMzcuMjMxMSA3MC41NDMyIDM4LjEzNTkgNjkuOTU2NyAzOC44OTMzIDY5LjIxMjRDMzkuNjM3NyA2OC40ODM4IDM5Ljg3OTYgNjcuNjY4NSAzOS44NjkxIDY2LjYzNDhDMzkuODYxMiA2NS45ODUyIDM5LjcxOTIgNjUuMzQzNCAzOS40NjQxIDY0Ljc0NjRDMzkuMjAxMSA2NC4xMzA5IDM4LjgxOTcgNjMuNTcwNyAzOC4zNzI2IDYzLjA3NjJWNjMuMDc4OVoiIGZpbGw9IiMwMDJGNjYiLz4KPHBhdGggZD0iTTY1LjIxMzEgNzcuMjUwMUM2NS4xODk1IDc3LjAyMzkgNjUuMTI5IDc2LjY3MTUgNjUuMTA1MyA3Ni41MTYzQzY1LjA3MzcgNzYuMjY2NCA2NS4wMzQzIDc2LjAzNSA2NC45OTc1IDc1Ljc5MDRDNjQuNzUwMiA3NC4xNDkxIDY0LjM4OTkgNzIuNTIxMSA2My44NzE4IDcwLjk0M0M2My40MzI1IDY5LjYwNjkgNjIuODgwMiA2OC4zMDUgNjIuMTg1OCA2Ny4wNzkzQzYxLjU4ODggNjYuMDI5OSA2MC44ODY2IDY1LjAzODMgNjAuMDY4NiA2NC4xNDkzQzU5LjM0NzkgNjMuMzY1NiA1OC41MzUyIDYyLjY2MDcgNTcuNjQ2MiA2Mi4wNzE1QzU2LjgzMzUgNjEuNTM1IDU1Ljk1NzcgNjEuMDkzMSA1NS4wMzk3IDYwLjc2OTZDNTQuMTc5NyA2MC40NjQ1IDUzLjI4MjggNjAuMjU5NCA1Mi4zNzU0IDYwLjE2MjFDNTEuNTEyNyA2MC4wNjc0IDUwLjYzOTUgNjAuMDcgNDkuNzc2OCA2MC4xNjczQzQ4Ljk1ODkgNjAuMjU5NCA0OC4xNDg4IDYwLjQ0MDggNDcuMzcwMyA2MC43MDkxQzQ2LjYzOTEgNjAuOTYxNiA0NS45MzE2IDYxLjI5MyA0NS4yNzY3IDYxLjcwNTlDNDQuNjY5MSA2Mi4wODk5IDQ0LjEwNjMgNjIuNTQ3NiA0My42MjIzIDYzLjA3ODlDNDMuMTcyNiA2My41NzMzIDQyLjc5MzggNjQuMTMzNiA0Mi41MzA4IDY0Ljc0OUM0Mi4yNzU3IDY1LjM0NjEgNDIuMTMxIDY1Ljk4NzggNDIuMTI1OCA2Ni42Mzc1QzQyLjExNTIgNjcuNjcxMSA0Mi4zNTcyIDY4LjQ4MzggNDMuMTAxNSA2OS4yMTVDNDMuODU5IDY5Ljk1OTMgNDQuNzYzOCA3MC41NDU5IDQ1LjcwNTQgNzEuMDMyNEM0Ni41MjYgNzEuNDU1OSA0Ny4zOTY2IDcxLjc4NzMgNDguMTgwMyA3Mi4yODE3QzQ5LjAyMiA3Mi44MTA0IDQ5LjY2NjQgNzMuNTQ2OCA1MC4xMjQgNzQuNDI3OUM1MC40NDc1IDc1LjA1MzkgNTAuNjg0MiA3NS43MjQ2IDUwLjg3NjIgNzYuNDAzMkM1MC45NDk5IDc2LjY2MzYgNTEuNTQ0MyA3OS4yMzMyIDUxLjQ2NTQgNzkuMjQ2NEM1Ni4wMjA4IDc4LjQxNTIgNjAuNjE1NyA3Ny43ODY2IDY1LjIxMzEgNzcuMjUyN1Y3Ny4yNTAxWiIgZmlsbD0iIzAwMkY2NiIvPgo8cGF0aCBkPSJNMzIuMTkxNyA2OS4xMDE5QzMzLjMyMTggNjkuMTAxOSAzNC4yMzc5IDY4LjE4NTggMzQuMjM3OSA2Ny4wNTU3QzM0LjIzNzkgNjUuOTI1NiAzMy4zMjE4IDY1LjAwOTQgMzIuMTkxNyA2NS4wMDk0QzMxLjA2MTYgNjUuMDA5NCAzMC4xNDU0IDY1LjkyNTYgMzAuMTQ1NCA2Ny4wNTU3QzMwLjE0NTQgNjguMTg1OCAzMS4wNjE2IDY5LjEwMTkgMzIuMTkxNyA2OS4xMDE5WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTQ5LjgwNTggNjkuMTAxOUM1MC45MzU5IDY5LjEwMTkgNTEuODUyIDY4LjE4NTggNTEuODUyIDY3LjA1NTdDNTEuODUyIDY1LjkyNTYgNTAuOTM1OSA2NS4wMDk0IDQ5LjgwNTggNjUuMDA5NEM0OC42NzU3IDY1LjAwOTQgNDcuNzU5NSA2NS45MjU2IDQ3Ljc1OTUgNjcuMDU1N0M0Ny43NTk1IDY4LjE4NTggNDguNjc1NyA2OS4xMDE5IDQ5LjgwNTggNjkuMTAxOVoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo='/>
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

      const signals = ['SIGTERM', 'SIGHUP', 'SIGINT']

      signals.forEach(signal => process.on(signal, () => {
        server.close()
        process.exitCode = 1
      }))

      server.listen(4242).on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error('Unable to start a local server on port 4242.'
            + ' Please check that `checkly login` isn\'t already running in a separate tab.'
            + ' On OS X and Linux, you can run `lsof -i :4242` to see which process is blocking the port.'))
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

    const tokenResponse = await this.#axiosInstance.post(
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
    const { baseURL } = getApiDefaults()

    const agent = new ProxyAgent()

    return axios.create({
      baseURL,
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${this.#accessToken}`,
      },
      httpAgent: agent,
      httpsAgent: agent,
    })
  }
}
