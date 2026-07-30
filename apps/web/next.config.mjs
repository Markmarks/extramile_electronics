// CSP allowing Supabase, Paystack, and Google/Apple auth origins (docs/05 §9, N-09).
// Next's dev bundler needs 'unsafe-eval' + localhost websockets; those are dev-only.
const isDev = process.env.NODE_ENV !== 'production';

const scriptSrc = ["'self'", "'unsafe-inline'", 'https://js.paystack.co'];
if (isDev) scriptSrc.push("'unsafe-eval'");

const connectSrc = [
  "'self'",
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://api.paystack.co',
  'https://accounts.google.com',
  'https://appleid.apple.com',
];
if (isDev) connectSrc.push('ws://localhost:*', 'http://localhost:*');

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self' https://checkout.paystack.com https://accounts.google.com https://appleid.apple.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${scriptSrc.join(' ')}`,
  `connect-src ${connectSrc.join(' ')}`,
  'frame-src https://checkout.paystack.com https://js.paystack.co',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  reactStrictMode: true,
  // packages/* ship raw TS/TSX and are compiled by Next.
  transpilePackages: ['@extramile/core', '@extramile/ui'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  // Linting runs as its own CI step against the repo-root flat config.
  eslint: { ignoreDuringBuilds: true },
  // Type errors must still fail the build.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
