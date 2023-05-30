import 'jest'

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveStdoutContaining(expectedOutput: string): R
    }
  }
}

expect.extend({
  toHaveStdoutContaining (received, expectedOutput) {
    const stdout = received.stdout
    if (stdout.includes(expectedOutput)) {
      return {
        pass: true,
        message: () => `Expected command output to not contain:\n ${this.utils.printExpected(expectedOutput)}\n\nReceived:\n${this.utils.printReceived(received)}`
      }
    } else {
      return {
        pass: false,
        message: () => `Expected command output to contain:\n ${this.utils.printExpected(expectedOutput)}\n\nReceived:\n${this.utils.printReceived(received)}`
      }
    }
  }
})
