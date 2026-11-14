// Pictures for articles, kept in R2. The editor uploads the file's bytes as
// they are; each gets a name nobody can guess and is served at /media/<name>
// forever, so readers' browsers can keep it without asking again.
import type { Env } from './env.ts';
import { HttpError, json } from './http.ts';

const TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
};
const MAX_BYTES = 20 * 1024 * 1024;

export async function upload(request: Request, env: Env): Promise<Response> {
    const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) throw new HttpError(415, 'Only pictures can go in an article: JPEG, PNG, GIF, WebP, AVIF or SVG.');
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) throw new HttpError(413, 'That picture is over 20 MB.');
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) throw new HttpError(400, 'That picture is empty.');
    if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'That picture is over 20 MB.');

    const month = new Date().toISOString().slice(0, 7);
    const key = `${month}/${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}.${ext}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
    return json({ url: `/media/${key}` }, 201);
}

export async function serve(request: Request, env: Env, key: string): Promise<Response> {
    if (!/^\d{4}-\d{2}\/[a-f0-9]{16}\.[a-z]+$/.test(key)) return new Response('Not found', { status: 404 });
    const object = await env.MEDIA.get(key, { onlyIf: request.headers });
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    // An SVG is a document that could run script; shown as a picture it can't, opened on its own it mustn't.
    headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    headers.set('x-content-type-options', 'nosniff');
    if (!('body' in object)) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}
