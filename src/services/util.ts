import * as path from 'path'
import * as fs from 'fs/promises'

export async function walkDirectory (
  directory: string, 
  ignoreDirectories: Set<string>, 
  callback: (filepath: string) => Promise<void>
): Promise<void> {
  const files = await fs.readdir(directory)
  for (const file of files.sort()) {
    const filepath = path.join(directory, file)
    const stats = await fs.stat(filepath)
    if (stats.isDirectory() && !ignoreDirectories.has(file)) {
      await walkDirectory(filepath, ignoreDirectories, callback)
    } else {
      await callback(filepath)  
    }
  }
}
