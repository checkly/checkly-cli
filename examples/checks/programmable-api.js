const axios = require('axios')
const { expect } = require('expect')

const { data } = await axios.get('https://webhook.site/e3912d7a-f4a2-4bce-977c-2dd1f8047602')

expect(data).toEqual('test')
