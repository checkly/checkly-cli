const { readdir, readFile } = require('fs/promises')
const axios = require('axios')
const endpoints = require('./endpoints')

function init({ api, apiKey, baseURL }) {
  const Authorization = `Bearer ${apiKey}`

  const _api =
    api ||
    axios.create({
      baseURL: baseURL || 'https://api.checklyhq.com/v1',
      headers: { Authorization },
    })

  const checks = {
    getAll({ limit, page } = {}) {
      return _api.get(endpoints.CHECKS, { limit, page })
    },

    async getAllLocal() {
      const checks = await readdir(`.checkly/checks`)
      return Promise.all(
        checks.map((check) => readFile(`.checkly/checks/${check}`, 'utf-8'))
      )
    },

    async run(check) {
      const req = axios.create({
        method: 'POST',
        headers: {
          'X-Checkly-Account': 'e46106d8-e382-4d1f-8182-9d63983ed6d4',
          Authorization:
            'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik9UTXhRakEzUVRkQk5EZEROMEpGUmtJMlJVVTROemhHTmtVelJrVTBNakE0T0RoRlEwWTRSQSJ9.eyJodHRwczovL2NoZWNrbHlocS5jb20vZW1haWwiOiJuaWNvQGNoZWNrbHlocS5jb20iLCJpc3MiOiJodHRwczovL2F1dGguY2hlY2tseWhxLmNvbS8iLCJzdWIiOiJnb29nbGUtb2F1dGgyfDEwMDQ3NTIyOTAwNzczMTMzNjU4MiIsImF1ZCI6WyJhcGktZGV2LmNoZWNrbHkucnVuIiwiaHR0cHM6Ly9jaGVja2x5LmV1LmF1dGgwLmNvbS91c2VyaW5mbyJdLCJpYXQiOjE2MjcwNDA1ODIsImV4cCI6MTYyNzQ3MjU4MiwiYXpwIjoiM0laNDhVTXZodFFxb2FodnJYWXJwQ3FjdXBoVURXZkgiLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIn0.cB0auCleZGd4IHO7T7-J4qvgA8RB1kTB238BxYD2Znr75d_j3D9NU835OeAtUPlOP1rqJLoklFy_4DaJNv0SUE33AkeZR_PL5dzPCQSNL3sjoo2KDmYXyo9NdW-f27-RL8vlsHGEMpipKZTc6ozY8n4ah4Oilk5hhmi3DS3G947tW020QjjQkEIucUgXMVFlNMgl4G0LelFI-DY_uENJdiJZyMSfJwp5UkJXiXqCZ2C52BEUefM66hLs3Gbe5lEqijt_f5VMmmlO_kA3Y9-p9XL5lIqGK7shSgpRTqFLv-ldD6BAWdKlw4D5CxfL-tXyyphfFt4EfBIorTe988FeEg',
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8081',
          Referer: 'http://localhost:8081/',
        },
      })
      return req.post(
        'http://localhost:3000/accounts/e46106d8-e382-4d1f-8182-9d63983ed6d4/browser-check-runs',
        check[0]
      )
    },

    create({ script, name, checkType = 'BROWSER', activated = true } = {}) {
      return _api.post(endpoints.CHECKS, { name, script, checkType, activated })
    },

    get(id) {
      return _api.get(endpoints.CHECKS + '/' + id)
    },
  }

  const account = {
    findOne() {
      return _api.get(endpoints.ACCOUNT)
    },
  }

  const checkStatuses = {
    getAll({ limit, page } = {}) {
      return _api.get(endpoints.CHECK_STATUSES, { limit, page })
    },
  }

  return {
    checks,
    account,
    checkStatuses,
  }
}

module.exports = {
  init,
}
