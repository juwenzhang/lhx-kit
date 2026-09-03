import type {Logger, LoggerOptions, LoggerSink, LogLevel, LogRecord} from './types';

const ORDER: Record<LogLevel, number> = {debug: 0, info: 1, warn: 2, error: 3};

export function createConsoleSink(): LoggerSink {
  return {
    write(record) {
      const fn = record.level === 'warn' ? console.warn : record.level === 'error' ? console.error : console.log;
      fn(`[${record.level}] ${record.message}`, record.data ?? '');
    }
  };
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = options.level ?? 'info';
  const sinks = new Set<LoggerSink>(options.sinks?.length ? options.sinks : [createConsoleSink()]);
  const tags = {...(options.tags || {})};

  function emit(level: LogLevel, message: string, data?: unknown, extraTags?: Record<string, string>): void {
    if (ORDER[level] < ORDER[threshold]) return;
    const record: LogRecord = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      tags: {...tags, ...(extraTags || {})}
    };
    for (const sink of sinks) sink.write(record);
  }

  const logger: Logger = {
    debug: (msg, data) => emit('debug', msg, data),
    info: (msg, data) => emit('info', msg, data),
    warn: (msg, data) => emit('warn', msg, data),
    error: (msg, data) => emit('error', msg, data),
    withTags(nextTags) {
      return createLogger({
        level: threshold,
        sinks: [...sinks],
        tags: {...tags, ...nextTags}
      });
    },
    addSink(sink) {
      sinks.add(sink);
    }
  };

  return logger;
}
