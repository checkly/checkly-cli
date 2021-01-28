const fs = require('fs')
const path = require('path')
const http = require('http')

const staticBasePath = path.join(__dirname, './static')

const staticServe = function (req, res) {
  const resolvedBase = path.resolve(staticBasePath)
  const safeSuffix = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '')
  const fileLoc = safeSuffix === '/' ? path.join(resolvedBase, './index.html') : path.join(resolvedBase, safeSuffix)

  fs.readFile(fileLoc, function (err, data) {
    if (err) {
      res.writeHead(404, 'Not Found')
      res.write('404: File Not Found!')
      return res.end()
    }

    res.statusCode = 200

    res.write(data)
    return res.end()
  })
}

const httpServer = http.createServer(staticServe)

httpServer.listen(9898)
