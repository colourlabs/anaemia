export type LogLevel = "info" | "warn" | "error" | "debug";

export type LogEvent = {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: number;
};

/**
 * a sink receives every log event emitted by a {@link Logger}. the default
 * {@link consoleSink} writes to the platform console; application code can
 * install any number of custom sinks (files, JSON streams, OpenTelemetry, ...)
 * by creating a logger with {@link createLogger} and configuring it via
 * `defineConfig({ logger })`.
 */
export type LoggerSink = (event: LogEvent) => void;

export interface Logger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
}

export const consoleSink: LoggerSink = (event) => {
  const msg = `[anaemia] ${event.message}`;
  const args = [msg, ...(event.data !== undefined ? [event.data] : [])];
  if (event.level === "error") {
    console.error(...args);
  } else if (event.level === "warn") {
    console.warn(...args);
  } else if (event.level === "debug") {
    console.debug(...args);
  } else {
    console.log(...args);
  }
};

/**
 * Build a {@link Logger} that fans every event out to the given sinks.
 * Filtering (e.g. dropping `debug` in production) belongs in the sink itself.
 */
export function createLogger(sinks: LoggerSink[]): Logger {
  const emit = (level: LogLevel, message: string, data?: unknown) => {
    const event: LogEvent = { level, message, data, timestamp: Date.now() };
    for (const sink of sinks) sink(event);
  };
  return {
    info: (message, data) => emit("info", message, data),
    warn: (message, data) => emit("warn", message, data),
    error: (message, data) => emit("error", message, data),
    debug: (message, data) => emit("debug", message, data),
  };
}

// the framework's process-wide logger. defaults to the console; applications
// replace it once at startup via `defineConfig({ logger })`. framework code
// goes through getLogger() so a custom logger takes effect everywhere.
let activeLogger: Logger = createLogger([consoleSink]);

export function getLogger(): Logger {
  return activeLogger;
}

export function setLogger(logger: Logger): void {
  activeLogger = logger;
}
