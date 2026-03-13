import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Use an internal URL for server-side GoTrue calls to avoid the middleware
// calling back into itself (infinite loop). Falls back to the public URL.
const SUPABASE_URL_INTERNAL =
  process.env.SUPABASE_URL_INTERNAL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

const ALLOWED_ORIGINS = new Set([
  "https://flowindex.io",
  "https://www.flowindex.io",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function middleware(request: NextRequest) {
  // Handle CORS for session and share API routes
  const isSessionApi = request.nextUrl.pathname.startsWith("/api/sessions") ||
                       request.nextUrl.pathname.startsWith("/api/share");

  if (isSessionApi) {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
    }
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      response.headers.set(key, value);
    }
    return response;
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL_INTERNAL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              domain: ".flowindex.io",
            })
          );
        },
      },
    }
  );

  // Check existing Supabase session
  const { data: { user } } = await supabase.auth.getUser();

  // If no Supabase session, try to pick up session from flowindex.io shared cookie
  if (!user) {
    const fiAuth = request.cookies.get("fi_auth");
    if (fiAuth?.value) {
      try {
        const parsed = JSON.parse(decodeURIComponent(fiAuth.value));
        if (parsed?.access_token && parsed?.refresh_token) {
          await supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
          });
        }
      } catch {
        // Invalid cookie — ignore
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|auth/|rest/|api/runner-chat|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
