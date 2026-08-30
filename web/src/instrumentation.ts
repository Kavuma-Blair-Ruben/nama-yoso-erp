export function register() {
  // withTimeout() (src/lib/withTimeout.ts) races a query against a timer,
  // but racing doesn't cancel the loser — if the timer wins, the real
  // query keeps running orphaned. If it later rejects on its own (e.g. a
  // stuck connection, or Postgres's own statement_timeout finally firing)
  // with nothing left awaiting it, that's an unhandled rejection — and
  // Node kills the entire process on those by default. Confirmed live:
  // a withTimeout-wrapped query crashed the process outright, well after
  // withTimeout had already returned to its caller. withTimeout itself was
  // hardened to catch its own direct race, but the same orphaning can also
  // happen one level down — inside a Promise.all() of several independent
  // queries, the first rejection settles the aggregate while the other
  // still-running queries are now unobserved too. That's a shape used in
  // dozens of files (every list/detail page's data fetch); patching every
  // call site individually isn't practical. This is the backstop: log it,
  // don't take the whole app down over one already-abandoned query.
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection (orphaned query, already timed out for its caller):", reason);
  });
}
