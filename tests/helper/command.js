/* eslint-disable no-undef */
const testCommand = async (klass, argv) => {
  const result = []

  const originalWrite = process.stdout.write

  const writeMock = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((val, encoding, cb) => {
      result.push(val)

      if (process.env.TEST_OUTPUT) {
        originalWrite(val, encoding, cb)
      } else if (cb) {
        cb()
      }

      return true
    })

  await klass.run(argv)

  writeMock.mockRestore()

  return {
    stdout: result,
  }
}

module.exports = testCommand
