import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withTimeout } from "@/lib/withTimeout";

// /api/webhooks/* is called by external services (Foodics, etc.) with no
// Supabase session at all — it authenticates itself (a secret embedded in
// the URL path), so the session-based auth gate must never intercept it.
const PUBLIC_PATHS = ["/login", "/auth/confirm", "/set-password", "/api/webhooks"];

/**
 * Optimistic auth gate: confirms a session exists and refreshes the
 * Supabase auth token/cookies (required here — this is the only place that
 * can reliably write refreshed cookies before the page renders; skipping it
 * causes silent session expiry). Deliberately does NOT check per-section
 * permission levels — that's a DB read and belongs in the request-scoped DAL
 * (src/server/auth/session.ts), not in proxy, which runs on every prefetch.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Timed out rather than left unguarded: a flaky/degraded Supabase Auth
  // upstream could make this call flip-flop between "user found" and
  // "user not found" from one request to the next, and since this runs on
  // EVERY request before any page renders, that flip-flopping showed up
  // live as an actual redirect loop — /dashboard bounces to /login because
  // this call happened to come back empty, /login immediately bounces back
  // to /dashboard because the very next call happened to succeed, repeat
  // until the browser gives up with ERR_TOO_MANY_REDIRECTS. On timeout or
  // any failure here, don't guess — pass the request through uncontested
  // and let the page-level guard (requireAuth/requireSection, which calls
  // the already timeout-guarded getSession() in src/server/auth/session.ts)
  // make the real, authoritative call.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const result = await withTimeout(supabase.auth.getUser(), 8000, "TIMEOUT");
    user = result.data.user;
  } catch {
    return response;
  }

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  // A degraded Supabase Auth upstream doesn't only throw/time out — it can
  // also just return an empty user on one request and the real one on the
  // very next, with no exception at all (seen live: /dashboard <-> /login
  // bouncing every request, each one a full document reload). One retry
  // before trusting "no user" absorbs that transient flip without weakening
  // the real logged-out case, which still comes back empty twice.
  if (!user && !isPublic) {
    try {
      const retry = await withTimeout(supabase.auth.getUser(), 8000, "TIMEOUT");
      user = retry.data.user;
    } catch {
      return response;
    }
  }

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, image optimization, and files served
    // straight out of public/ (logo, favicons, etc.) — those need to load on
    // the login page itself, before any session exists, so the auth gate
    // must never intercept them. Matching only _next/static/_next/image
    // missed this: any other public/ asset (e.g. /brand/nama-yoso-logo.png)
    // was being redirected to /login instead of served, breaking the <img>.
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)",
  ],
};
