const { promises: fs } = require('fs')
const path = require('path')

async function walk (dir, callback) {
  const files = await fs.readdir(dir)
  for (const file of files) {
    const filepath = path.join(dir, file)
    const stats = await fs.stat(filepath)

    if (stats.isDirectory()) {
      await walk(filepath, callback)
    } else if (stats.isFile()) {
      await callback(filepath, stats)
    }
  }
}

module.exports = walk
