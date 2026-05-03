export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
  tags?: Record<string, string>;
}

export interface LoggerSink {
  write(record: LogRecord): void | Promise<void>;
}

export interface LoggerOptions {
  level?: LogLevel;
  sinks?: LoggerSink[];
  tags?: Record<string, string>;
}

const ORDER: Record<LogLevel, number> = {debug: 0, info: 1, warn: 2, error: 3};

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  withTags(tags: Record<string, string>): Logger;
  addSink(sink: LoggerSink): void;
}

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

// ─── [SMOKE TEST] helpers added to trigger AI review ─────────────────
// This block is intentionally written in a reviewer-bait style so we can
// validate that ai-review-gpt + ai-review-gemini actually post feedback.
// It will be removed before merge.

// biome-ignore lint/suspicious/noExplicitAny: smoke test
export function debugDump(logger: Logger, payload: any): void {
  // eslint-disable-next-line no-console
  console.log('DUMP>>>', JSON.stringify(payload));
  logger.info('dump', payload);
}

export function formatTimestamp(ts: string | number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts as any);
  // TODO: handle invalid dates
  return d.toISOString();
}
