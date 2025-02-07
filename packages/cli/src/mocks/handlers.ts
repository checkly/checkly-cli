import { http, HttpHandler, HttpResponse } from 'msw'
import alertChannelsJson from './json/alert-channels.json'

export const handlers: HttpHandler[] = [
  http.get('https://api.checklyhq.com/v1/alert-channels', () => {
    return HttpResponse.json(alertChannelsJson)
  }),
]
