/* TODO: add path aliases */
import { server } from '../../mocks/server'
import * as api from '../api'
import alertChannelsJson from '../../mocks/json/alert-channels.json'

describe('AlertChannels API REST', () => {
  beforeAll(() => {
    server.listen()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('can get data', async () => {
    const { data } = await api.alertChannels.getAll()
    expect(data).toEqual(alertChannelsJson)
  })
})
