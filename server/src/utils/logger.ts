type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;

function emit(level: Level, scope: string, msg: string, extra?: unknown): void {
  if (ORDER[level] < threshold) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${scope} :: ${msg}`;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  if (extra === undefined) stream(line);
  else stream(line, typeof extra === 'string' ? extra : JSON.stringify(extra));
}

export function logger(scope: string) {
  return {
    debug: (m: string, e?: unknown) => emit('debug', scope, m, e),
    info: (m: string, e?: unknown) => emit('info', scope, m, e),
    warn: (m: string, e?: unknown) => emit('warn', scope, m, e),
    error: (m: string, e?: unknown) => emit('error', scope, m, e),
  };
}
