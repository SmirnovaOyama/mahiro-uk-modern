// One author, one password. Signing in sets an HttpOnly cookie holding an
// expiry time and an HMAC of it; nothing is stored server-side.
import type { Env } from './env.ts';

const COOKIE = 'writing_session';
const LIFETIME_MS = 30 * 24 * 3_600_000;
const text = new TextEncoder();

const b64url = (bytes: ArrayBuffer): string =>
    btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
    try {
        const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(bin, c => c.charCodeAt(0));
    } catch {
        return null;
    }
}

function key(env: Env): Promise<CryptoKey> {
    const secret = env.SESSION_SECRET || `session:${env.ADMIN_PASSWORD ?? ''}`;
    return crypto.subtle.importKey('raw', text.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function checkPassword(given: string, env: Env): Promise<boolean> {
    if (!env.ADMIN_PASSWORD) return false;
    // Hash both, so the comparison is between equal lengths and takes the same time whatever was typed.
    const [a, b] = await Promise.all([
        crypto.subtle.digest('SHA-256', text.encode(given)),
        crypto.subtle.digest('SHA-256', text.encode(env.ADMIN_PASSWORD)),
    ]);
    return crypto.subtle.timingSafeEqual(a, b);
}

const cookieAttrs = (url: URL): string => `Path=/; HttpOnly; SameSite=Strict${url.protocol === 'https:' ? '; Secure' : ''}`;

export async function sessionCookie(env: Env, url: URL): Promise<string> {
    const expires = String(Date.now() + LIFETIME_MS);
    const sig = b64url(await crypto.subtle.sign('HMAC', await key(env), text.encode(expires)));
    return `${COOKIE}=${expires}.${sig}; Max-Age=${LIFETIME_MS / 1000}; ${cookieAttrs(url)}`;
}

export const clearCookie = (url: URL): string => `${COOKIE}=; Max-Age=0; ${cookieAttrs(url)}`;

export async function isSignedIn(request: Request, env: Env): Promise<boolean> {
    if (!env.ADMIN_PASSWORD) return false;
    const cookie = request.headers.get('cookie') ?? '';
    const value = cookie
        .split(/;\s*/)
        .find(c => c.startsWith(`${COOKIE}=`))
        ?.slice(COOKIE.length + 1);
    if (!value) return false;
    const [expires = '', sig = ''] = value.split('.');
    if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
    const bytes = fromB64url(sig);
    if (!bytes) return false;
    return crypto.subtle.verify('HMAC', await key(env), bytes, text.encode(expires));
}

/**
 * The cookie is SameSite=Strict, which already keeps other sites from using it.
 * As a second lock, a change must come from a page on this same origin.
 */
export function sameOrigin(request: Request, url: URL): boolean {
    const origin = request.headers.get('origin');
    return origin === null || origin === url.origin;
}
