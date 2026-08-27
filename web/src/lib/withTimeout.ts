// Supabase Auth calls (signInWithPassword, getUser, ...) have no built-in
// timeout — if their upstream is slow or degraded (e.g. Supabase's own
// connection-pooler incidents), an unguarded await just hangs forever with
// no feedback to the user. Race it against a timer instead, so a slow
// upstream becomes a clear, retryable error rather than an infinite spinner.
export async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
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
