import pino from 'pino'

export const rootLogger = pino(
  {
    level: process.env.CHECKLY_LOG_LEVEL || 'silent',
    formatters: {
      bindings: (bindings) => {
        return { pid: bindings.pid }
      },
      level: (label) => {
        return { level: label.toUpperCase() }
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'password',
      ],
    },
  },
  pino.destination('checkly.debug.log'),
)

export type Logger = pino.Logger
