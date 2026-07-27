import { NextResponse } from "next/server";
import { COUNTRIES, DEFAULT_COUNTRY } from "./src/lib/localeConfig.js";

const SUPPORTED = new Set(COUNTRIES.map(c => c.code));
const ADMIN_SESSION_COOKIE = "lajoo_admin_session";

function shouldBypassLocaleRouting(path) {
  if (path.startsWith("/api")) return true;
  if (path.startsWith("/_next")) return true;
  if (path === "/favicon.ico") return true;
  if (/\.[a-z0-9]+$/i.test(path)) return true;
  return false;
}

export function middleware(req) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  if (path.startsWith("/admin")) {
    const isLoginRoute = path === "/admin/login" || path.startsWith("/admin/login/");
    if (!isLoginRoute && !req.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
      url.pathname = "/admin/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (shouldBypassLocaleRouting(path)) {
    return NextResponse.next();
  }

  const cookieCountry = req.cookies.get("lajoo_country")?.value?.toLowerCase();
  const fromCookie = cookieCountry && SUPPORTED.has(cookieCountry) ? cookieCountry : null;

  const detected = (req.geo?.country || "").toLowerCase(); // empty on localhost
  const fromIp = detected && SUPPORTED.has(detected) ? detected : null;

  const preferred = fromCookie || fromIp || DEFAULT_COUNTRY;

  if (path === "/" || path === "") {
    url.pathname = `/${preferred}`;
    return NextResponse.redirect(url);
  }

  const first = path.split("/")[1]?.toLowerCase();
  if (first && !SUPPORTED.has(first)) {
    url.pathname = `/${preferred}${path}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/:path*"] };
