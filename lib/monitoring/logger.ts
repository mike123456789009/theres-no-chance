type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === "development";
  }

  private formatLogEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
      };
    }

    return entry;
  }

  private write(entry: LogEntry): void {
    const output = JSON.stringify(entry);

    switch (entry.level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "debug":
        if (this.isDevelopment) {
          console.debug(output);
        }
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.write(this.formatLogEntry("debug", message, context));
  }

  info(message: string, context?: LogContext): void {
    this.write(this.formatLogEntry("info", message, context));
  }

  warn(message: string, context?: LogContext): void {
    this.write(this.formatLogEntry("warn", message, context));
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.write(this.formatLogEntry("error", message, context, error));
  }
}

export const logger = new Logger();
