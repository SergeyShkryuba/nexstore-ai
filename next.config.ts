import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Points next-intl at the per-request message loader.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** `https://host` from a URL-ish env value, or "" when unset or malformed. */
function originOf(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

const isDev = process.env.NODE_ENV === "development";
// Vercel's preview toolbar (comments, feedback) loads from vercel.live.
const isVercelPreview = process.env.VERCEL_ENV === "preview";
const vercelLive = isVercelPreview ? "https://vercel.live" : "";

const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
// Error reports go straight from the browser to Sentry's ingest host.
const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);

/**
 * Content Security Policy, set statically rather than with per-request nonces:
 * a nonce forces every page to render on demand, and the catalogue is
 * prerendered with ISR. So inline scripts stay allowed ('unsafe-inline' — the
 * App Router streams its payload in inline scripts), and the policy's value is
 * everywhere else: no plugins, no <base> hijack, no framing, forms post only
 * here, and fetches and images only reach the hosts listed. An injected script
 * could run but could not send what it found anywhere but this site, Supabase
 * or Sentry.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Dev only: React uses eval to rebuild server error stacks in the browser.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} ${vercelLive}`,
  `style-src 'self' 'unsafe-inline' ${vercelLive}`,
  // Product photos go through /_next/image ('self'); the rest is admin upload
  // previews (blob:) and the hosts next/image is allowed to fetch.
  `img-src 'self' data: blob: https://images.unsplash.com https://placehold.co ${supabase} ${
    isVercelPreview ? "https://vercel.live https://vercel.com" : ""
  }`,
  `font-src 'self' data: ${isVercelPreview ? "https://vercel.live https://assets.vercel.com" : ""}`,
  // Auth, wishlist and photo uploads talk to Supabase from the browser.
  `connect-src 'self' ${supabase} ${sentry} ${isVercelPreview ? "https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${isVercelPreview ? vercelLive : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Not in dev: it would upgrade http://localhost requests to https.
  isDev ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .map((directive) => directive.replace(/\s+/g, " ").trim())
  .join("; ");

const nextConfig: NextConfig = {
  images: {
    // Only hosts we actually serve product imagery from. Adding a host here is a
    // deliberate decision: next/image proxies and caches whatever is allowed.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "placehold.co" },
      // Photos uploaded from the admin panel (see `isAllowedImageUrl`).
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/product-images/**",
      },
    ],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
