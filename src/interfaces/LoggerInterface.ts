export interface LoggerInterface {
  log(level: string, message: string, context?: Record<string, unknown>): void;
}
