// Split out from instrumentation.ts so this Node-only code never gets
// statically bundled into the Edge runtime chunk (proxy.ts runs on Edge,
// which has no process.on) — see the comment in instrumentation.ts on why
// this matters and what it's protecting against.
export function registerNodeHandlers() {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection (orphaned query, already timed out for its caller):", reason);
  });
}
