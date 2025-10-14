import { NextResponse } from "next/server";
import { COUNTRIES, DEFAULT_COUNTRY } from "./src/lib/localeConfig.js";

const SUPPORTED = new Set(COUNTRIES.map(c => c.code));

export function middleware(req) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

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
