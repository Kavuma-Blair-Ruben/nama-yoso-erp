import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

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
