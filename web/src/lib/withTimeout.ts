// Supabase Auth calls (signInWithPassword, getUser, ...) have no built-in
// timeout — if their upstream is slow or degraded (e.g. Supabase's own
// connection-pooler incidents), an unguarded await just hangs forever with
// no feedback to the user. Race it against a timer instead, so a slow
// upstream becomes a clear, retryable error rather than an infinite spinner.
//
// Racing does NOT cancel the loser — if the timeout wins, the original
// `promise` keeps running in the background with nothing left awaiting it.
// If it later rejects on its own (e.g. Postgres's own statement_timeout
// finally firing after we'd already given up and moved on), that's an
// unhandled promise rejection, and Node crashes the whole process on those
// by default. Confirmed live: a second call to a withTimeout-wrapped query
// crashed the process outright with an uncaught PostgresError, well after
// this function had already returned. The `.catch()` below doesn't change
// what the caller sees — it only stops the orphaned promise from taking
// the whole server down when it eventually settles unobserved.
export async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  promise.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
