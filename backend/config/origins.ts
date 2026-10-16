import { env } from './env';

/**
 * RFC1918 / loopback / link-local host check. Used only in non-production so a
 * dev machine can reach the API from another device on the same LAN without a
 * reverse proxy (see app.ts).
 */
export function isPrivateNetworkHost(hostname: string): boolean {
  if (!hostname) return false;

  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  ) {
    return true;
  }

  if (normalized.startsWith('10.') || normalized.startsWith('192.168.') || normalized.startsWith('172.')) {
    const parts = normalized.split('.');
    if (parts.length === 4) {
      const second = Number(parts[1]);
      if (normalized.startsWith('172.')) {
        return second >= 16 && second <= 31;
      }
      return true;
    }
  }

  if (normalized.startsWith('::ffff:')) {
    return isPrivateNetworkHost(normalized.replace('::ffff:', ''));
  }

  return false;
}

/**
 * Reduces any URL/origin to `scheme://host[:port]` (dropping default ports,
 * paths, queries and trailing slashes) so comparisons are exact. Returns null
 * for anything unparseable.
 */
export function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Single source of truth for "may this Origin make a credentialed request?",
 * shared by the CORS layer and the CSRF guard so they can never disagree.
 *
 * The explicit allowlist is matched by exact normalized origin (never a prefix
 * match, which would also accept `https://app.example.com.evil.io`). Loopback
 * and RFC1918 LAN origins are additionally accepted in non-production only:
 * reflecting any private-network origin with credentials in production would
 * let a malicious page hosted on the same network drive an authenticated
 * session.
 */
export function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;

  const source = normalizeOrigin(origin);
  if (!source) return false;

  if (env.corsOrigins.some((allowed) => normalizeOrigin(allowed) === source)) return true;

  if (env.isProduction) return false;
  return isPrivateNetworkHost(new URL(source).hostname);
}
