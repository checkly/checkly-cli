export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export class Logger {
  constructor (
    private readonly scope: string,
    private readonly minLevel: LogLevel = 'info',
  ) {}

  private emit (level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
      return
    }
    const method = level === 'debug' ? 'log' : level
    // eslint-disable-next-line no-console
    console[method](`[${this.scope}] ${message}`)
  }

  debug (message: string): void {
    this.emit('debug', message)
  }

  info (message: string): void {
    this.emit('info', message)
  }

  warn (message: string): void {
    this.emit('warn', message)
  }

  error (message: string): void {
    this.emit('error', message)
  }

  child (scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.minLevel)
  }
}
