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
              <img class="slide-in" style="width: 140px; height: 140px;" src='data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTIwIDEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCI+CiAgPHBhdGggZD0iTTEwNC43NzYgMzUuMzg3Yy0uMjg1LS41OS0uNzAyLTEuMTI2LTEuMzIyLTEuNDctLjY4Mi0uMzc0LTEuNDMtLjQzNy0yLjEyOS0uMzEzbC0uMDQ5LS4wMjZDOTAuNzY4IDM1LjQgODAuMTY1IDQzLjQzMiA3My43NyA1NS43NDVjLTYuODg5IDEzLjI2OC02Ljk5IDI3LjgzNS0xLjM3NiAzNy44MDQgMTEuMjc1LS45MiAyMy4wNDctOS4yMjUgMjkuOTM4LTIyLjQ5MiA2LjQyMS0xMi4zNTIgNi45MzgtMjUuODIyIDIuNDQ1LTM1LjY3MXYuMDAxWiIgZmlsbD0iIzgyOGQ4YyIvPgogIDxwYXRoIGQ9Ik0xMDEuMjU1IDM0Ljk2M0M5MC45IDM2Ljg2IDgwLjg0NCA0NS4wNDUgNzQuOTU1IDU2LjM4MWMtNi4yMzMgMTItNi45MTMgMjUuOTA3LTEuODE0IDM1LjcyNkM4NCA5MC44NCA5NC45MTQgODIuNDIzIDEwMS4xNDUgNzAuNDIyYzUuOTU4LTExLjQ2IDYuODgyLTI0LjY2NCAyLjQxNC0zNC40NjUtLjE4OC0uMzg0LS40MzgtLjY3Mi0uNzQ2LS44NDItLjM4Ni0uMi0uODMtLjI1OC0xLjI1NS0uMTY5LS4xLjAxOS0uMjAyLjAyNS0uMzAzLjAxN1pNNzIuMzkzIDk0LjkxMWMtLjQ4MiAwLS45My0uMjY0LTEuMTY0LS42ODctNi4wODMtMTAuODA0LTUuNTY1LTI1Ljc5MiAxLjM1NC0zOS4xMTUgNi40MTEtMTIuMzQ0IDE3LjA1NC0yMC44OTUgMjguNDY4LTIyLjg3NS4xMDktLjAyLjIyLS4wMjQuMzMtLjAxNGE0LjUwMiA0LjUwMiAwIDAgMSAyLjcxLjUwMWMuODA2LjQ0NSAxLjQ0IDEuMTM5IDEuODg2IDIuMDY0IDQuODI3IDEwLjU4IDMuODggMjQuNzEyLTIuNDYgMzYuOTA4Qzk2LjU5NyA4NS4wMTMgODQuNzEyIDkzLjkxIDcyLjUgOTQuOTA2bC0uMTA4LjAwNVoiIGZpbGw9IiMxMjE3MTYiLz4KICA8cGF0aCBkPSJNOTkuODU3IDQxLjE2NmEzNS43MzUgMzUuNzM1IDAgMCAxIDcuNzEyIDUuNjY2Yy0uMzA4LTQuMTE3LTEuMjI1LTguMDEtMi43OTMtMTEuNDQ2LS4yODUtLjU4OC0uNzAyLTEuMTI1LTEuMzIyLTEuNDY4LS42ODQtLjM3NS0xLjQzLS40MzgtMi4xMjktLjMxNGwtLjA0OS0uMDI2Yy0zLjYyMy42My03LjI0NyAyLjA0NS0xMC43MTggNC4wNjZhMzUuNTcgMzUuNTcgMCAwIDEgOS4zIDMuNTIyWm0tMTYuNDMxIDMuMDAxYTY5LjY0OSA2OS42NDkgMCAwIDAtNy45MTcgOS40NzRjNS4xNzktLjM2MSAxMC44OTguOTEyIDE2LjA4IDQgNS4xNTYgMy4wNjQgOS4wMjcgNy40OSAxMS4yNDcgMTIuMjNhNzAuMTMgNzAuMTMgMCAwIDAgNC4xNzktMTEuNzgzYy0yLjY5NC0zLjU1NS02LjE3NS02LjcxMy0xMC4zNzQtOS4yMTQtNC4yNzItMi41NDgtOC43NjktNC4wOC0xMy4yMTUtNC43MDh2LjAwMVpNNzAuMDcgNjAuODkyYTg1LjUyIDg1LjUyIDAgMCAwLTQuNDcyIDEwLjQwNCAyNi4zMDIgMjYuMzAyIDAgMCAxIDE0LjQ4IDMuOTg1YzQuNjE4IDIuODUyIDYuNjggNy4xOSA4Ljc4NiAxMS42NTMgNC4xNi0yLjA0IDYuMTkzLTUuOTQ1IDguNDA4LTkuMTdBMzMuMjQ0IDMzLjI0NCAwIDAgMCA4NS43NyA2NS43OWEzMi42MjMgMzIuNjIzIDAgMCAwLTE1LjctNC44OThaIiBmaWxsPSIjMTIxNzE2Ii8+CiAgPHBhdGggZD0iTTMyLjA4OCAyMi43OWM0LjM4NSA0LjQ1MiA1LjU2IDEwLjQ4IDIuNjIzIDEzLjQ2My0yLjkzNCAyLjk4Mi04Ljg3IDEuNzktMTMuMjUzLTIuNjY2LTQuMzgyLTQuNDUxLTUuNTU3LTEwLjQ4LTIuNjIzLTEzLjQ2NCAyLjkzNi0yLjk4IDguODctMS43ODYgMTMuMjUzIDIuNjY2WiIgZmlsbD0iIzgyOGQ4YyIvPgogIDxwYXRoIGQ9Ik0yOS4xOCAyNS43NDVjMi4yMDMgMi4yMjggMi45MDUgNS4xNCAxLjU3OCA2LjQ4Ni0xLjMzNSAxLjM1NC00LjE5Ny42NDItNi4zOTYtMS41OTQtMi4xOTYtMi4yMzQtMi44OTctNS4xMzctMS41NjctNi40ODkgMS4zMzMtMS4zNTQgNC4xODctLjYzOSA2LjM4NiAxLjU5NXYuMDAyWiIgZmlsbD0iIzEyMTcxNiIvPgogIDxwYXRoIGQ9Ik0yMy4xMjQgMTkuODQ2Yy0uOTY1IDAtMi4zMy4yMTQtMy4zNCAxLjI0LTIuMzY4IDIuNDA3LTEuMTY1IDcuNjkzIDIuNjIzIDExLjU0IDIuNDA3IDIuNDQ3IDUuNDAzIDMuOTA4IDguMDE0IDMuOTA4Ljk2NSAwIDIuMzMyLS4yMTUgMy4zNDEtMS4yNDIgMS4wOTYtMS4xMTIgMS40NzQtMi44NzEgMS4wNy00Ljk1My0uNDQ2LTIuMjgzLTEuNzU4LTQuNjItMy42OTMtNi41ODYtMi40MDctMi40NDctNS40MDMtMy45MDctOC4wMTUtMy45MDdabTcuMjk3IDE5LjQxMmMtMy4zMDcgMC03LjAxMi0xLjc2LTkuOTEtNC43MDYtNC45ODItNS4wNjItNi4xMzMtMTEuODIyLTIuNjIzLTE1LjM5IDEuMzE1LTEuMzM2IDMuMTIzLTIuMDM5IDUuMjM2LTIuMDM5IDMuMzA3IDAgNy4wMSAxLjc1NyA5LjkxIDQuNzA0IDIuMzA4IDIuMzQxIDMuODc3IDUuMTc3IDQuNDI2IDcuOTgzLjU4NyAzLjAwMy0uMDU1IDUuNjMzLTEuODAyIDcuNDA3LTEuMzEzIDEuMzM2LTMuMTI2IDIuMDQtNS4yMzcgMi4wNFoiIGZpbGw9IiMxMjE3MTYiLz4KICA8cGF0aCBkPSJNNzIuMzkyIDIyLjc5Yy00LjM4NCA0LjQ1Mi01LjU2IDEwLjQ4MS0yLjYyMyAxMy40NjMgMi45MzUgMi45ODIgOC44NyAxLjc5IDEzLjI1Mi0yLjY2NiA0LjM4Mi00LjQ1MSA1LjU1OC0xMC40OCAyLjYyMy0xMy40NjItMi45MzQtMi45ODItOC44Ny0xLjc4OC0xMy4yNTIgMi42NjRaIiBmaWxsPSIjODI4ZDhjIi8+CiAgPHBhdGggZD0iTTc1LjI5OSAyNS43NDVjLTIuMjAyIDIuMjI4LTIuOTA0IDUuMTQtMS41NzcgNi40ODYgMS4zMzYgMS4zNTQgNC4xOTguNjQyIDYuMzk2LTEuNTk0IDIuMTk3LTIuMjM0IDIuODk5LTUuMTM3IDEuNTY5LTYuNDg5LTEuMzM0LTEuMzU0LTQuMTktLjYzOS02LjM4OCAxLjU5NXYuMDAyWiIgZmlsbD0iIzEyMTcxNiIvPgogIDxwYXRoIGQ9Ik03My4zNCAyMy43NTNjLTEuOTM1IDEuOTY2LTMuMjQ2IDQuMzA0LTMuNjkgNi41ODYtLjQwNyAyLjA4NC0uMDI3IDMuODQxIDEuMDY3IDQuOTUzIDEuMDExIDEuMDI3IDIuMzc4IDEuMjQyIDMuMzQ0IDEuMjQyIDIuNjA5IDAgNS42MDQtMS40NiA4LjAxMy0zLjkwOCAzLjc4OC0zLjg0OSA0Ljk5LTkuMTMyIDIuNjIzLTExLjUzOC0xLjAxLTEuMDI2LTIuMzc1LTEuMjQtMy4zNC0xLjI0LTIuNjE0IDAtNS42MDggMS40NTgtOC4wMTcgMy45MDd2LS4wMDJabS00LjUxOCAxMy40NjRjLTEuNzQ3LTEuNzczLTIuMzg3LTQuNDA0LTEuOC03LjQwNy41NDYtMi44MDYgMi4xMTctNS42NDIgNC40MjMtNy45ODMgMi45LTIuOTQ3IDYuNjA0LTQuNzA0IDkuOTEyLTQuNzA0IDIuMTEyIDAgMy45MjEuNzA1IDUuMjM0IDIuMDQgMy41MTIgMy41NjcgMi4zNiAxMC4zMjctMi42MjEgMTUuMzktMi45IDIuOTQ2LTYuNjA0IDQuNzAzLTkuOTEgNC43MDMtMi4xMTIgMC0zLjkyNC0uNzA0LTUuMjM4LTIuMDM4di0uMDAxWiIgZmlsbD0iIzEyMTcxNiIvPgogIDxwYXRoIGQ9Ik04MS44MzggMzMuODYzYy02LjkxLTkuNjg0LTE3LjU1Ni0xNi43NC0yOS41OTgtMTYuNzQtMTIuMDQ0IDAtMjIuNjg3IDcuMDU2LTI5LjU5OSAxNi43NC04LjQwNyAxMS43NzgtMTMuMjggMjguNDc0LTguMjc3IDQyLjU5NiA0LjIzNyAxMS45NjcgMTQuNDA2IDIxLjA1NyAyNi4zNjQgMjQuNTIxYTQxLjM1MSA0MS4zNTEgMCAwIDAgMTEuNTEyIDEuNjI0YzMuODg3IDAgNy43NzMtLjU0IDExLjUxLTEuNjI0IDExLjk2LTMuNDYzIDIyLjEzLTEyLjU1NSAyNi4zNjUtMjQuNTIgNS4wMDMtMTQuMTIzLjEzMi0zMC44MTktOC4yNzctNDIuNTk2di0uMDAxWiIgZmlsbD0iIzgyOGQ4YyIvPgogIDxwYXRoIGQ9Ik04NC42OTQgMzkuMjIxYy0uNDgtMS45MzQtMS42OTYtMy43Ny0yLjgzLTUuMzU4YTQ1LjMyNSA0NS4zMjUgMCAwIDAtNC44MTQtNS42ODNjLTYuMjQ5LTMuMDQ4LTEzLjM5Mi0zLjA0Mi0xOC44MzYuNjktMi44MzggMS45NDUtNC44MjcgNC42NjUtNS45NzQgNy43NjMtMS4xNDYtMy4wOTgtMy4xMzctNS44MTYtNS45NzQtNy43NjQtNS40NDYtMy43My0xMi41ODgtMy43MzctMTguODM2LS42OWE0NS4xOTYgNDUuMTk2IDAgMCAwLTQuODE1IDUuNjg0Yy0xLjEzNCAxLjU5LTIuMzUgMy40MjQtMi44MjggNS4zNTgtLjUwMSAyLjAxNS0xLjIyMiA0LjcxNi0xLjEyNyA2Ljc1NC4xNTQgMy4zMTUgMi4xNzMgNS43NTUgNC44MzggNy41MDguNjUxLjQzMiA3LjYyNCA1Ljg1MyA2Ljk3NSA2LjIzOC40OTEtLjI5MyAxLjExMi0uNjUgMS44MDMtMS4wMTl2LjYyYzIuNTI4LTEuNDk4IDYuMjA0LTMuMzMyIDguNjY1LTMuMDQ1bC4wMy4wMDRjLjA3My4wMS4xMy4wNC4xOTguMDU0LjY3OC4xOCAxLjI3Mi41MTYgMS43MjcgMS4wOCAxLjA1MyAxLjMgMS4xNDggMi44MDQuNzgyIDQuMjY0LjI3LS4yMDIuNTE0LS40NTguNzgtLjY3NC0uMDMxIDEuMDA3LS4yNTUgMS43Ny0uMjU1IDEuNzdsLS40NTguNjU0YzIuNzkyLjUzNSA1LjYyNi44MDUgOC40NjkuODAzaC4wNDFjMi45NDUgMCA1Ljc4MS0uMjg1IDguNDgtLjgwM2wtLjQ1OS0uNjU0cy0uMjI1LS43NjMtLjI1NC0xLjc3Yy4yNjUuMjE2LjUwOS40NzIuNzgxLjY3NC0uMzY3LTEuNDYtLjI3Mi0yLjk2My43OC00LjI2NC40NTUtLjU2NCAxLjA1LS45IDEuNzI3LTEuMDguMDctLjAxNC4xMjctLjA0Ni4xOTgtLjA1NGwuMDMtLjAwNGMyLjQ2MS0uMjg4IDYuMTM3IDEuNTQ3IDguNjY1IDMuMDQ2di0uNjJjLjY5MS4zNjggMS4zMTIuNzI1IDEuODA1IDEuMDE4LS42NS0uMzg2IDYuMzIyLTUuODA3IDYuOTcyLTYuMjM2IDIuNjY2LTEuNzU1IDQuNjg2LTQuMTk1IDQuODM5LTcuNTEuMDk1LTIuMDM4LS42MjUtNC43MzktMS4xMjUtNi43NTRaTTUyLjI0IDY5Ljc4M2MtMTAuMTUgMC0xOC4zNzIgMTAuMjktMTguMzcyIDIyLjk4MSAwIDIuNTM2LjM0IDQuOTY1Ljk0NSA3LjI0MyAxLjExLjMzNyAyLjIxLjcwMiAzLjM0OC45NzFhNjEuMTY3IDYxLjE2NyAwIDAgMCAxNC4wNzkgMS42MjVjNC43NTQgMCA5LjUwNi0uNTQgMTQuMDgtMS42MjUgMS4xMzgtLjI3IDIuMjM3LS42MzIgMy4zNDgtLjk3MS42MDUtMi4yNzguOTQ1LTQuNzA3Ljk0NS03LjI0MyAwLTEyLjY5Mi04LjIyNC0yMi45OC0xOC4zNzItMjIuOThoLS4wMDFaIiBmaWxsPSIjZWRlZGVhIi8+CiAgPHBhdGggZD0iTTU0LjMxMyA0OC45NTRhNi4wNiA2LjA2IDAgMCAxLTEuNC4yNjRjLjAzNi0uMDgzLjEwNS0uMTQ4LjEwNS0uMjR2LTEuODQ2Yy4wODMtLjA2Ni4xNzUtLjExMi4yNDgtLjIwMmwxLjQyNS0xLjc1Yy41NjMtLjY5MS4yOTgtMS4yNTgtLjU4Ni0xLjI1OGgtMy43MjhjLS44ODYgMC0xLjE1LjU2Ny0uNTg3IDEuMjU3bDEuNDI1IDEuNzVjLjEyLjE0Ni4yNjYuMjY2LjQzMi4zNTN2MS42OTZjMCAuMDkyLjA2NC4xNTcuMDk4LjI0YTYuMzQ3IDYuMzQ3IDAgMCAxLTEuMzk1LS4yNjRjLS41ODItLjE4OS0xLjc4My0uODk2LTEuOTQ5LjIwMnYuMmMwIDIuMiAxLjc1IDMuOTgyIDMuOTI2IDMuOTg2aC4wMWMyLjE3NS0uMDA0IDMuOTIzLTEuNzg2IDMuOTIzLTMuOTg3di0uMTk5Yy0uMTY0LTEuMDk4LTEuMzY1LS4zOS0xLjk0Ni0uMjAyaC0uMDAxWiIgZmlsbD0iIzEyMTcxNiIvPgogIDxwYXRoIGQ9Ik01Mi4yNCAxOC40ODJjLTEwLjc4MyAwLTIxLjE3NiA1LjktMjguNTEgMTYuMThDMTQuNDkyIDQ3LjU5OSAxMS4zMTEgNjMuODIzIDE1LjYyNiA3NmMzLjk2MiAxMS4xOTcgMTMuNzIyIDIwLjI2OCAyNS40NjkgMjMuNjdhNDAuNDc4IDQwLjQ3OCAwIDAgMCAyMi4yODYgMEM3NS4xMzIgOTYuMjY4IDg0Ljg5IDg3LjE5NyA4OC44NTQgNzZjNC4zMTUtMTIuMTc3IDEuMTM0LTI4LjQwMi04LjEtNDEuMzM3LTcuMzM5LTEwLjI4Mi0xNy43My0xNi4xOC0yOC41MTQtMTYuMThabTAgODUuNDg0Yy00LjAyLjAwNS04LjAxOS0uNTYtMTEuODgtMS42NzktMTIuNzUxLTMuNjkzLTIyLjk0LTEzLjE3NC0yNy4yNTktMjUuMzY2LTUuNTg4LTE1Ljc4LjcwNS0zMy4wMDIgOC40NTktNDMuODZDMjkuNDAzIDIyLjA2NiA0MC41ODcgMTUuNzYgNTIuMjM4IDE1Ljc2YzExLjY1MyAwIDIyLjgzNyA2LjMwNyAzMC42ODUgMTcuMzAyIDcuNzQ5IDEwLjg1OCAxNC4wNDMgMjguMDggOC40NTMgNDMuODYtNC4zMTYgMTIuMTkyLTE0LjUwNSAyMS42NzItMjcuMjU4IDI1LjM2NGE0Mi40OTcgNDIuNDk3IDAgMCAxLTExLjg3OCAxLjY3OHYuMDAzWiIgZmlsbD0iIzEyMTcxNiIvPgogIDxwYXRoIGQ9Ik00MS40NyAzMy4xODFhNy43MDQgNy43MDQgMCAwIDAtMy43NTEtLjkzNWMtMy43OTEgMC03LjU2NyAzLjIzNi05LjQxOCA1LjQxMi0zLjExIDMuNjU4LTUuOTkgMTEuMDE0LS4wMzggMTMuNTM4IDIuMTUxLjkxMyA0LjUyMyAxLjE4OSA2LjgzNyAxLjIzMiAyLjk1Ny4wNTggNi4xMTctLjAxMSA4LjQ0OS0yLjEyOSAyLjM2Ni0yLjE0OCAyLjc0OS01LjY2IDIuNTI4LTguNzA3LS4yODUtMy45NTgtMS45MjEtNi45NDgtNC42MDctOC40MTFaIiBmaWxsPSIjMTIxNzE2Ii8+CiAgPHBhdGggZD0iTTQxLjYxIDM5LjUzOGMtLjA0LS41Mi0uNjA1LTEuMDk1LS45MzQtMS4zOTRhMy45OTggMy45OTggMCAwIDAtMi42NS0xLjAxM2MtLjMxIDAtLjYyOC4wMzUtLjk1LjEwNC0xLjI0NS4yNjUtMi4yOTIgMS4wMjgtMi44NyAyLjA5NS0uMjIuNDA0LS41OTUgMS4yMS0uNDk5IDEuNjcuMDgxLjM4My40MzguNjQ3LjgwMi43MTQuNDg0LjA5LjY3NC0uMTQuOTA0LS41NGwuMTQ0LS4yNDNjLjctMS4xMDMgMS42OS0xLjcxIDIuNzg4LTEuNzEuNjEzIDAgLjk4OS4xOCAxLjU0Ni41NTYuMzY3LjI0OS43NjYuNzQ1IDEuMjY0LjQ3OC4zNTktLjE5My40NzUtLjQ0Ni40NTYtLjcxN1oiIGZpbGw9IiNmZmZmZmUiLz4KICA8cGF0aCBkPSJNNjMuMDEgMzMuMTgxYTcuNzEgNy43MSAwIDAgMSAzLjc1Mi0uOTM1YzMuNzkxIDAgNy41NjUgMy4yMzYgOS40MTYgNS40MTIgMy4xMTQgMy42NTggNS45OTMgMTEuMDE0LjA0IDEzLjUzOC0yLjE1MS45MTMtNC41MjUgMS4xODktNi44MzggMS4yMzItMi45NTYuMDU4LTYuMTE0LS4wMTEtOC40NDgtMi4xMjktMi4zNjctMi4xNDgtMi43NDktNS42Ni0yLjUyOC04LjcwNy4yODUtMy45NTggMS45Mi02Ljk0OCA0LjYwNi04LjQxMVoiIGZpbGw9IiMxMjE3MTYiLz4KICA8cGF0aCBkPSJNNjIuODY5IDM5LjUzOGMuMDQxLS41Mi42MDUtMS4wOTUuOTM1LTEuMzk0YTMuOTk4IDMuOTk4IDAgMCAxIDIuNjUtMS4wMTNjLjMxIDAgLjYyNy4wMzUuOTQ5LjEwNCAxLjI0Ni4yNjUgMi4yOTQgMS4wMjggMi44NzEgMi4wOTUuMjIxLjQwNC41OTUgMS4yMS40OTggMS42Ny0uMDguMzgzLS40MzguNjQ3LS44MDEuNzE0LS40ODQuMDktLjY3NC0uMTQtLjkwNC0uNTRsLS4xNDMtLjI0M2MtLjcwMS0xLjEwMy0xLjY5MS0xLjcxLTIuNzg4LTEuNzEtLjYxNiAwLS45OS4xOC0xLjU0OC41NTYtLjM2Ni4yNDktLjc2Ni43NDUtMS4yNjQuNDc4LS4zNTgtLjE5My0uNDc1LS40NDYtLjQ1NS0uNzE3WiIgZmlsbD0iI2ZmZmZmZSIvPgogIDxwYXRoIGQ9Ik02MC42NTIgMTguNjkyYy4wNjEtLjIwMi4xMjctLjM5OC4xODQtLjYxM2EzOS40NzggMzkuNDc4IDAgMCAwLTguNTk2LS45NTZjLTIuOTQgMC01LjgxMi4zMzctOC41OTYuOTU4LjA1Ny4yMTMuMTIyLjQwOS4xODQuNjExbC0xLjQ2NC4yNi4yMDYuNjMzLjA2NC40OTVjLjQyOC0uMTUzLjg4MS0uMjUgMS4zNjQtLjI1Ljc3OCAwIDEuNi4zMjUgMi4yNDEuNzU2IDIuNDE0IDEuNjQ5IDQuMTgyIDMuODcyIDUuMzc2IDYuMzkuMTMzLjE5NS4zMjYuMzQ5LjYwMi4zNDlhLjc1Ljc1IDAgMCAwIC42NTEtLjQwM2guMDIxYzEuMTk2LTIuNDk2IDIuOTUzLTQuNjk4IDUuMzUxLTYuMzM2LjY0Mi0uNDMgMS40NjMtLjc1NiAyLjI0Mi0uNzU2LjQ4NCAwIC45MzYuMDk5IDEuMzYzLjI1bC4wNjUtLjQ5NS4yMDUtLjYzMi0xLjQ2My0uMjYxWiIgZmlsbD0iIzEyMTcxNiIvPgogIDxwYXRoIGQ9Ik01Mi4zMTYgMTA0LjI0YzE1LjUyMiAwIDI4LjEwNi0xMi41ODIgMjguMTA2LTI4LjEwNSAwLTE1LjUyMi0xMi41ODItMjguMTA3LTI4LjEwNi0yOC4xMDctMTUuNTIxIDAtMjguMTA2IDEyLjU4My0yOC4xMDYgMjguMTA3IDAgMTUuNTIxIDEyLjU4MyAyOC4xMDYgMjguMTA2IDI4LjEwNloiIGZpbGw9IiMxM2NlNjYiIGZpbGwtcnVsZT0ibm9uemVybyIgc3Ryb2tlPSIjMWFiMzVlIiBzdHJva2Utd2lkdGg9IjMuMDY0NSIvPgogIDxwYXRoIGQ9Ik0yNS42MzcgNjQuMzM2Yy0uMzcxIDAtLjcyNS0uMTU2LS45NzYtLjQyOWExLjM4NCAxLjM4NCAwIDAgMSAuMDU4LTEuOTI2Yy4zMDYtLjI5MSAzLjA1NS0yLjg5MyA1LjAwNC0zLjg0N2ExLjMzNSAxLjMzNSAwIDAgMSAxLjc4OC42MzYgMS4zNyAxLjM3IDAgMCAxLS42MjUgMS44MTVjLTEuMzM2LjY1NS0zLjU3OSAyLjY2My00LjMzIDMuMzgtLjI0Ny4yMzgtLjU3Ni4zNzEtLjkyLjM3MVoiIGZpbGw9IiMxMjE3MTYiLz4KICA8cGF0aCBkPSJNMzIuMTYzIDgzLjQyOGM0LjM5MyA0LjQ2NCA1LjM2NyAxMC43MiAyLjE2OCAxMy45NjctMy4yIDMuMjUxLTkuMzU2IDIuMjY5LTEzLjc1LTIuMTk2LTQuMzkyLTQuNDctNS4zNjctMTAuNzItMi4xNjEtMTMuOTcgMy4xOTMtMy4yNTMgOS4zNTEtMi4yNjcgMTMuNzQ0IDIuMmgtLjAwMVoiIGZpbGw9IiM4MjhkOGMiLz4KICA8cGF0aCBkPSJNMzAuNjg0IDg4LjYwNGMyLjQxNSAyLjQ1OCAyLjgxMiA2LjAzNy44ODMgOC4wMDEtMS45MzEgMS45NjMtNS40NjEgMS41NjMtNy44NzYtLjg5My0yLjQyMS0yLjQ2LTIuODItNi4wNDMtLjg4Ni04LjAwNyAxLjkzLTEuOTYyIDUuNDYxLTEuNTU5IDcuODguODk5WiIgZmlsbD0iI2VkZWRlYSIvPgogIDxwYXRoIGQ9Ik0yMy4zNDIgODAuNjczYy0xLjYyNiAwLTMgLjUyNC0zLjk3NSAxLjUxOS0xLjIzOCAxLjI1Ni0xLjczMiAzLjE1Ni0xLjM5IDUuMzUzLjM2NSAyLjM1NSAxLjYyNiA0LjczIDMuNTUzIDYuNjkgMy42OTYgMy43NjIgOS4yOSA0LjgwNyAxMS44NTQgMi4xOTcgMS4yMzUtMS4yNTYgMS43MjctMy4xNTUgMS4zODctNS4zNTItLjM2Ny0yLjM1Ni0xLjYyOC00LjczMS0zLjU1NS02LjY4OC0yLjI5MS0yLjMzLTUuMjMzLTMuNzE5LTcuODc2LTMuNzE5aC4wMDJabTYuMDYzIDIwLjAwMmMtMy4zODggMC02Ljk1LTEuNjQ3LTkuNzctNC41MTQtMi4zMjYtMi4zNjMtMy44NTQtNS4yNzQtNC4zMDYtOC4xOTMtLjQ4LTMuMDguMjgyLTUuODE2IDIuMTQyLTcuNzAzIDEuNDg3LTEuNTE2IDMuNTE3LTIuMzE2IDUuODY5LTIuMzE2IDMuMzg2IDAgNi45NDkgMS42NDcgOS43NzEgNC41MTcgMi4zMjUgMi4zNjEgMy44NTQgNS4yNyA0LjMwNiA4LjE5LjQ4IDMuMDgtLjI4IDUuODE2LTIuMTM4IDcuNzAyLTEuNDkyIDEuNTE3LTMuNTI0IDIuMzE3LTUuODc0IDIuMzE3WiIgZmlsbD0iIzEyMTcxNiIvPgogIDxwYXRoIGQ9Ik03Mi4zMTcgODMuNDI4Yy00LjM5MyA0LjQ2NC01LjM2NiAxMC43Mi0yLjE2NyAxMy45NjcgMy4xOTggMy4yNTEgOS4zNTYgMi4yNjkgMTMuNzUtMi4xOTYgNC4zOTItNC40NyA1LjM2NS0xMC43MiAyLjE2MS0xMy45Ny0zLjE5My0zLjI1My05LjM1MS0yLjI2Ny0xMy43NDQgMi4yWiIgZmlsbD0iIzgyOGQ4YyIvPgogIDxwYXRoIGQ9Ik03My43OTUgODguNjA0Yy0yLjQxMyAyLjQ1OC0yLjgxMSA2LjAzNy0uODggOC4wMDEgMS45MyAxLjk2MyA1LjQ1OSAxLjU2MyA3Ljg3NS0uODkzIDIuNDItMi40NiAyLjgxOC02LjA0My44ODYtOC4wMDctMS45MzItMS45NjItNS40NjEtMS41NTktNy44OC44OTlaIiBmaWxsPSIjZWRlZGVhIi8+CiAgPHBhdGggZD0iTTczLjI2NCA4NC4zOTJjLTEuOTI2IDEuOTU3LTMuMTg3IDQuMzMyLTMuNTU1IDYuNjg4LS4zNCAyLjE5Ny4xNTMgNC4wOTcgMS4zODggNS4zNTIgMi41NjIgMi42MSA4LjE1NiAxLjU2MyAxMS44NTQtMi4xOTcgMS45MjYtMS45NjEgMy4xODgtNC4zMzYgMy41NTMtNi42OS4zNDItMi4xOTYtLjE1My00LjA5OS0xLjM5MS01LjM1My0uOTc2LS45OTYtMi4zNDgtMS41MTktMy45NzMtMS41MTktMi42NDIgMC01LjU4NiAxLjM5MS03Ljg3NiAzLjcxOVptLTQuMDYyIDEzLjk2NmMtMS44NTktMS44ODYtMi42MTktNC42MjItMi4xNC03LjcwMi40NTMtMi45MiAxLjk4Mi01LjgyOSA0LjMwNi04LjE5IDIuODIzLTIuODcgNi4zODctNC41MTcgOS43NzItNC41MTcgMi4zNTIgMCA0LjM4Mi44MDEgNS44NjggMi4zMTYgMS44NjIgMS44ODcgMi42MjMgNC42MjMgMi4xNDUgNy43MDMtLjQ1MyAyLjkxOS0xLjk4MyA1LjgzLTQuMzA3IDguMTkzLTIuODIyIDIuODY3LTYuMzgzIDQuNTE0LTkuNzcgNC41MTQtMi4zNSAwLTQuMzgyLS44MDEtNS44NzQtMi4zMTdaIiBmaWxsPSIjMTIxNzE2Ii8+CiAgPHBhdGggZD0iTTMwLjE5NSA1Ny44MTZjMS45OTQtMS4yMzYgNy43NTctNC4zODUgMTEuNDU1LTIuMTI1IDEuOTMzIDEuMTggMy4wNTMgMi45OTcgMy4xNTcgNS4xMjYuMTU4IDMuMTY1LTEuOTM0IDYuNjMxLTUuNzM4IDkuNTEyLTIuNDkyIDEuODg1LTYuMDY1IDIuODg4LTkuODA0IDIuODg4YTIwLjgzIDIwLjgzIDAgMCAxLTUuODkzLS44NDZjLTUuNjAyLTEuNjU0LTkuODIyLTUuNTk1LTExLjg4NS0xMS4xLS4yNjQtLjcwMSAyLjA4LS4xODggMi43NzQtLjQ1NGw2LjcxNi0xMS40MjZjLjQ4IDAgLjg3Mi4yNzUgMS4xMjMuNjQ4IDEuMDY4IDIuMDA3IDIuMDc0IDIuOTY2IDMuNjczIDQuNDkyIDEuMzI3IDEuMjcgMi43NzggMi40NjcgNC40MjIgMy4yODVabTQ0LjA2OC4wMzRjLTEuOTk1LTEuMjM4LTcuNzU2LTQuMzg3LTExLjQ1Ny0yLjEyNS0xLjkzIDEuMTc4LTMuMDUyIDIuOTk3LTMuMTU2IDUuMTI1LS4xNTcgMy4xNjQgMS45MzUgNi42MyA1LjczOCA5LjUxMSAyLjQ5MyAxLjg4NiA2LjA2NiAyLjg4OCA5LjgwNSAyLjg4OCAxLjk2MSAwIDMuOTctLjI3NSA1Ljg5MS0uODQ0IDUuNjA0LTEuNjU1IDkuODIyLTUuNTk3IDExLjg4Ni0xMS4xLjI2NS0uNzAzLTIuMDgtLjE5LTIuNzczLS40NTVMODMuNDggNDkuNDIzYy0uNDggMC0uODc0LjI3Ni0xLjEyMy42NS0xLjA2OCAyLjAwNS0yLjA3MyAyLjk2NC0zLjY3MyA0LjQ5Mi0xLjMyOSAxLjI2OS0yLjc3OCAyLjQ2NS00LjQyMiAzLjI4NHYuMDAxWiIgZmlsbD0iIzgyOGQ4YyIgZmlsbC1ydWxlPSJub256ZXJvIi8+CiAgPHBhdGggZD0iTTY0LjQ4MiA3MS43M2EyLjk3NSAyLjk3NSAwIDAgMCAwLTQuMjI1IDMuMDM0IDMuMDM0IDAgMCAwLTQuMjUgMGwtMTEuOSAxMS44My0zLjg4NS0zLjg2YTMuMDM0IDMuMDM0IDAgMCAwLTQuMjUgMCAyLjk3OCAyLjk3OCAwIDAgMCAwIDQuMjI0bDYuMDEgNS45NzVhMy4wMzQgMy4wMzQgMCAwIDAgNC4yNSAwbDE0LjAyNy0xMy45NDNoLS4wMDJaIiBmaWxsPSIjZmZmIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz4KICA8cGF0aCBkPSJNNDEuNjUgNTUuNjkxYy0zLjY5OC0yLjI2LTkuNDYuODg5LTExLjQ1NSAyLjEyNS0xLjY0NC0uODItMy4wOTUtMi4wMTYtNC40MjItMy4yODUtMS42LTEuNTI2LTIuNjA1LTIuNDg2LTMuNjczLTQuNDkyLS4yNS0uMzczLS42NDMtLjY0OC0xLjEyMy0uNjQ4LTEuNTY3IDAtMS41NDEgMS42ODUtLjkyIDIuNjgxIDEuOTIyIDMuMDY1IDQuMTE3IDUuMDQ3IDcuMDgzIDcuMDc0LjgzNS41NjkgMS43MTYgMS4wOTYgMi42NTcgMS40NzUuNDA5LjE2My44ODIuMTIyIDEuMjUyLS4xMyAxLjYzMy0xLjEwMiA2LjgxNC0zLjkyOCA5LjIyNC0yLjQ2NSAxLjE3NC43MTYgMS43OTkgMS43MDEgMS44NiAyLjkyNy4xMDcgMi4yMS0xLjYzNiA0Ljg5Ny00LjY2NiA3LjE5LTMuMTEgMi4zNTMtOC41OTkgMy4wMTUtMTMuMzQ2IDEuNjEzLTMuMzgtLjk5Ni03Ljg4LTMuNDQ4LTEwLjEzLTkuNDUzYTEuMzMgMS4zMyAwIDAgMC0xLjczLS43ODcgMS4zNyAxLjM3IDAgMCAwLS43NzQgMS43NTZjMi4wNjMgNS41MDQgNi4yODMgOS40NDUgMTEuODg1IDExLjEgMS45MjIuNTY4IDMuOTMuODQ1IDUuODkzLjg0NSAzLjczOSAwIDcuMzEyLTEuMDAyIDkuODA0LTIuODg4IDMuODA0LTIuODggNS44OTYtNi4zNDcgNS43NC05LjUxMi0uMTA2LTIuMTI5LTEuMjI2LTMuOTQ3LTMuMTU3LTUuMTI2aC0uMDAyWm0yMS4xOCAwYzMuNjk4LTIuMjYgOS40Ni44ODkgMTEuNDU2IDIuMTI1IDEuNjQ0LS44MiAzLjA5NS0yLjAxNiA0LjQyLTMuMjg1IDEuNi0xLjUyNiAyLjYwNS0yLjQ4NiAzLjY3NS00LjQ5Mi4yNS0uMzczLjY0My0uNjQ4IDEuMTIxLS42NDggMS41NyAwIDEuNTQzIDEuNjg1LjkyIDIuNjgxLTEuOTIyIDMuMDY1LTQuMTE2IDUuMDQ3LTcuMDggNy4wNzQtLjgzOC41NjktMS43MTkgMS4wOTYtMi42NiAxLjQ3NWExLjM0NCAxLjM0NCAwIDAgMS0xLjI1LS4xM2MtMS42MzMtMS4xMDItNi44MTUtMy45MjgtOS4yMjUtMi40NjUtMS4xNzMuNzE2LTEuOCAxLjcwMS0xLjg1OSAyLjkyNy0uMTA3IDIuMjEgMS42MzYgNC44OTcgNC42NjQgNy4xOSAzLjExIDIuMzUzIDguNiAzLjAxNSAxMy4zNDYgMS42MTMgMy4zOC0uOTk2IDcuODgtMy40NDggMTAuMTMxLTkuNDUzYTEuMzMgMS4zMyAwIDAgMSAxLjcyOS0uNzg3IDEuMzcgMS4zNyAwIDAgMSAuNzc1IDEuNzU2Yy0yLjA2MiA1LjUwNC02LjI4MiA5LjQ0NS0xMS44ODYgMTEuMWEyMC44NDUgMjAuODQ1IDAgMCAxLTUuODkzLjg0NWMtMy43MzggMC03LjMxMi0xLjAwMi05LjgwMy0yLjg4OC0zLjgwNS0yLjg4LTUuODk2LTYuMzQ3LTUuNzM4LTkuNTEyLjEwNC0yLjEyOSAxLjIyNS0zLjk0NyAzLjE1Ni01LjEyNloiIGZpbGw9IiMxMjE3MTYiLz4KICA8cGF0aCBkPSJNNzguODQzIDY0LjMzNmMuMzcgMCAuNzI0LS4xNTYuOTc2LS40MjlhMS4zODYgMS4zODYgMCAwIDAtLjA1Ny0xLjkyNmMtLjMwNi0uMjkxLTMuMDU1LTIuODkzLTUuMDA2LTMuODQ3YTEuMzM2IDEuMzM2IDAgMCAwLTEuNzg4LjYzNiAxLjM3NyAxLjM3NyAwIDAgMCAuNjI3IDEuODE1YzEuMzM0LjY1NSAzLjU3OCAyLjY2MyA0LjMyOCAzLjM4LjI0Ny4yMzguNTc2LjM3MS45Mi4zNzFaIiBmaWxsPSIjMTIxNzE2Ii8+Cjwvc3ZnPgo='/>
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
