import type {LogSink} from './types';

/**
 * Creates a logging sink that outputs log messages to the console.
 */
export function createConsoleSink(): LogSink {
  return (level, ...args) => {
    console[level](...args);
  };
}
