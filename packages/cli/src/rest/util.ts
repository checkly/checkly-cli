import zlib from 'node:zlib'

import { AxiosRequestHeaders } from 'axios'
import { JsonStreamStringify } from 'json-stream-stringify'

export function compressJSONPayload (data: any, headers: AxiosRequestHeaders) {
  headers['Content-Type'] = 'application/json'
  headers['Content-Encoding'] = 'gzip'

  const zipper = zlib.createGzip()
  const streamer = new JsonStreamStringify(data)

  return streamer.pipe(zipper)
}
