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

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  withTags(tags: Record<string, string>): Logger;
  addSink(sink: LoggerSink): void;
}
