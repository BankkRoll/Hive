import { convexAuthNextjsMiddleware, createRouteMatcher } from "@convex-dev/auth/nextjs/server";

import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/offline", "/api/webhooks(.*)", "/api/auth(.*)"]);

// Next.js 16+: Export as `proxy` instead of default middleware
export const proxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();

  // Allow public routes
  if (isPublicRoute(request)) {
    return;
  }

  // For unauthenticated users on protected routes, redirect to home with auth dialog
  // Redirect to HOME (not current route) to avoid race condition where:
  // 1. User closes dialog on protected route
  // 2. Middleware re-adds ?auth on next navigation
  // By redirecting to home, the auth flow is clean and predictable
  if (!isAuthenticated) {
    const homeUrl = new URL("/", request.url);
    homeUrl.searchParams.set("auth", "sign-in");
    return NextResponse.redirect(homeUrl);
  }
});

export const config = {
  // Exclude static files, icons, images from middleware
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
