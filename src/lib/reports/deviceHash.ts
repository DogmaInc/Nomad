import 'server-only';

/**
 * Device identity for rate limiting (CLAUDE.md §6.5).
 *
 * A salted hash of a client-supplied token plus a COARSE view of the IP. Deliberately not
 * an account, not a cookie you can correlate across sites, and never displayed or exported —
 * §5 says `device_hash` exists for rate limiting and nothing else.
 *
 * The IP is truncated to a /24 (or /48 for v6) before hashing. That is enough to stop one
 * person filing twenty reports from a phone, and not enough to single out a household from
 * the stored value. Combined with the salt, the hash is not reversible to an address.
 *
 * Reports are anonymous by design (§6.4 Tier 2, §13 "no owner accounts"), so this is the
 * only handle we have — and it should stay the weakest one that does the job.
 */

import { createHmac } from 'node:crypto';

/** Truncate to a network prefix so the stored hash cannot identify one connection. */
function coarseIp(ip: string): string {
  if (ip.includes(':')) {
    // IPv6 → first three hextets (~/48)
    return ip.split(':').slice(0, 3).join(':');
  }
  return ip.split('.').slice(0, 3).join('.');
}

export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? '0.0.0.0';
}

export function deviceHash(clientToken: string, headers: Headers): string {
  const salt = process.env.DEVICE_HASH_SALT;
  if (!salt) throw new Error('DEVICE_HASH_SALT is not set — see .env.example.');

  return createHmac('sha256', salt)
    .update(`${clientToken}|${coarseIp(clientIpFrom(headers))}`)
    .digest('hex');
}
