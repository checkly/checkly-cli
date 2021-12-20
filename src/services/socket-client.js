const mqtt = require('mqtt')
const consola = require('consola')

const LAST_WILL_TOPIC = 'last-will'
const CLIENT_CONNECTED = 'client-connected'
const CLIENT_DISCONNECTED = 'client-disconnected'

const getNotification = (topic) => JSON.stringify({ topic })

const validateClientConnected = (client) => {
  if (!client) {
    throw new Error('Client is not connected yet. Call client.connect() first!')
  }
}

const client = function (url, topic) {
  const options = {
    will: {
      topic: LAST_WILL_TOPIC,
      payload: getNotification(topic)
    }
  }
  let client = null
  const clientWrapper = {}

  clientWrapper.connect = (url) => {
    return new Promise((resolve, reject) => {
      client = mqtt.connect(url, options)
      client.on('connect', () => {
        consola.debug('checkly:socket-client:connected')
        client.subscribe(CLIENT_CONNECTED)
        client.subscribe(CLIENT_DISCONNECTED, (err, granted) => {
          if (err) {
            return reject(err)
          }
          resolve(granted)
        })
      })
    })
  }

  clientWrapper.subscribe = (topic) => {
    return new Promise((resolve, reject) => {
      if (client) {
        client.subscribe(topic, (err, granted) => {
          if (err) {
            return reject(err)
          }
          consola.debug('checkly:socket-client:subscribed:', topic)
          resolve(granted)
        })
      } else {
        return resolve
      }
    })
  }

  clientWrapper.unsubscribe = (topic) => {
    return new Promise((resolve) => {
      if (client) {
        client.unsubscribe(topic, () => {
          return resolve()
        })
      } else {
        return resolve()
      }
    })
  }

  clientWrapper.end = () => {
    // client might not be initiated if a user has expired credentials and hits the dashboard
    if (client) {
      client.end()
    }
  }

  clientWrapper.onConnect = (cb) => {
    validateClientConnected(client)
    client.on('connect', cb)
    return clientWrapper
  }

  clientWrapper.onDisconnect = (cb) => {
    validateClientConnected(client)
    client.on('close', cb)
    return clientWrapper
  }

  clientWrapper.onMessageReceived = (cb) => {
    client.on('message', (topic, message) => {
      consola.debug('checkly:socket-client:received')
      cb(topic, JSON.parse(message.toString('utf8')))
    })
    return clientWrapper
  }

  return clientWrapper
}

module.exports = client
