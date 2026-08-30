import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withTimeout } from "@/lib/withTimeout";

/**
 * Refreshes the Supabase auth token/cookies on every request (required
 * here — this is the only place that can reliably write refreshed cookies
 * before the page renders; skipping it causes silent session expiry), plus
 * one convenience redirect off of /login for an already-signed-in user.
 * Deliberately does NOT gate protected pages itself — see the comment
 * below on why that decision moved to requireAuth/requireSection instead.
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

  // Deliberately NOT redirecting an unauthenticated user to /login here
  // anymore. This function runs on every single request (including
  // background prefetches), so it was making that call — and betting the
  // outcome on one flaky external API response — far more often than
  // strictly needed. A degraded Supabase Auth upstream doesn't only
  // throw/time out, it can also just return an empty user on one request
  // and the real one on the next with no exception at all; even a retry
  // here isn't airtight against a sustained rough patch. Live symptom was
  // /dashboard <-> /login bouncing repeatedly, each bounce a full document
  // reload. requireAuth/requireSection (called by every protected page,
  // via the already timeout-guarded getSession() in
  // src/server/auth/session.ts) already redirects to /login on its own
  // when there's genuinely no session — that's the one authoritative
  // check now. This function's job is just refreshing cookies, plus the
  // one low-risk convenience redirect below (only ever fires while
  // sitting on /login itself, so a bad moment there just means the login
  // page renders instead of bouncing away instantly — not a loop).
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
