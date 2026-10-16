/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// Backend origin that same-origin `/api/*` requests are proxied to (see
// lib/apiClient.ts). Read at build time; defaults to the production API.
const backendUrl = (
  process.env.BACKEND_URL || (isProd ? 'https://billingsite.onrender.com' : 'http://localhost:5000')
).replace(/\/+$/, '');

// 'unsafe-inline' for scripts/styles is required by Next.js's inlined hydration
// data and injected styles; 'unsafe-eval' is deliberately absent (React/Next
// don't use eval in production). Applied in production only so dev keeps its
// eval-based HMR and error overlay.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  // The API is reached through the same-origin `/api` rewrite.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['192.168.100.33'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
  async headers() {
    if (!isProd) return [];
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
