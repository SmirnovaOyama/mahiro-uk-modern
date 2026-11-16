// The site's Worker. Everything static (the sentence, the editor's page, the
// pictures) is served straight from the built assets; wrangler.jsonc sends only
// these paths here first:
//
//   /writing, /writing/:slug, /writing/feed.xml, /collections/:slug   what readers see
//   /friends                                                          the people the blog points to
//   /projects                                                         what I make
//   /sitemap.xml                                                      for search engines
//   /media/...                                                        pictures in articles
//   /admin/preview/:id                                                a draft, for its author
//   /api/...                                                          the editor's API
import type { ArticleUpdate, CollectionUpdate, Friend, Project } from '../src/shared/api.ts';
import { avatarSrc } from '../src/shared/friends.ts';
import { renderMarkdown, SLUG_MAX } from '../src/shared/markdown.ts';
import { checkPassword, clearCookie, isSignedIn, sameOrigin, sessionCookie } from './auth.ts';
import * as db from './db.ts';
import type { Env } from './env.ts';
import { HttpError, ids, json, optionalTime, readJson, str } from './http.ts';
import * as media from './media.ts';
import { anyStale, withPreviews } from './previews.ts';
import { articlePage, collectionPage, feed, friendsPage, notFound, projectsPage, respond, sitemap, writingIndex } from './pages.ts';

const route = (path: string, pattern: string): Record<string, string> | null => {
    const want = pattern.split('/');
    const got = path.split('/');
    if (want.length !== got.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < want.length; i++) {
        if (want[i]!.startsWith(':')) {
            if (!got[i]) return null;
            try {
                params[want[i]!.slice(1)] = decodeURIComponent(got[i]!);
            } catch {
                return null;
            }
        } else if (want[i] !== got[i]) return null;
    }
    return params;
};

const idOf = (s: string | undefined): number => {
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found.');
    return n;
};

async function api(request: Request, env: Env, url: URL): Promise<Response> {
    const path = url.pathname.replace(/\/+$/, '');
    const method = request.method;
    const now = Date.now();

    if (method !== 'GET' && !sameOrigin(request, url)) throw new HttpError(403, 'Changes must come from this site.');

    if (path === '/api/session' && method === 'GET') {
        return json({ signedIn: await isSignedIn(request, env), configured: Boolean(env.ADMIN_PASSWORD) });
    }
    if (path === '/api/session' && method === 'POST') {
        const { password } = await readJson<{ password?: unknown }>(request);
        if (!env.ADMIN_PASSWORD) throw new HttpError(503, 'No password is set. Add ADMIN_PASSWORD to the Worker’s secrets.');
        if (!(await checkPassword(str(password ?? '', 'password', 1000), env))) {
            // A pause makes guessing slow.
            await new Promise(r => setTimeout(r, 800));
            throw new HttpError(401, 'That isn’t the password.', 'password');
        }
        return json({ signedIn: true }, 200, { 'set-cookie': await sessionCookie(env, url) });
    }
    if (path === '/api/session' && method === 'DELETE') {
        return json({ signedIn: false }, 200, { 'set-cookie': clearCookie(url) });
    }

    if (!(await isSignedIn(request, env))) throw new HttpError(401, 'Sign in first.');

    let p: Record<string, string> | null;

    // ── articles
    if (path === '/api/articles') {
        if (method === 'GET') return json(await db.listArticles(env.DB, now));
        if (method === 'POST') {
            const { title = '' } = await readJson<{ title?: unknown }>(request);
            return json(await db.createArticle(env.DB, str(title, 'title', 300), now), 201);
        }
    }
    if ((p = route(path, '/api/articles/:id'))) {
        const id = idOf(p.id);
        if (method === 'GET') return json(await db.getArticle(env.DB, id, now));
        if (method === 'PUT') {
            const b = await readJson<Record<string, unknown>>(request);
            const update: ArticleUpdate = {
                title: str(b.title, 'title', 300),
                slug: str(b.slug, 'slug', SLUG_MAX),
                summary: str(b.summary, 'summary', 1000),
                body: str(b.body, 'body', 500_000),
                publishedAt: optionalTime(b.publishedAt, 'publishedAt'),
                updatedAt: optionalTime(b.updatedAt, 'updatedAt') ?? 0,
            };
            return json(await db.updateArticle(env.DB, id, update, now));
        }
        if (method === 'DELETE') {
            await db.deleteArticle(env.DB, id);
            return json({ deleted: id });
        }
    }
    if ((p = route(path, '/api/articles/:id/publish')) && method === 'POST') return json(await db.publishArticle(env.DB, idOf(p.id), now));
    if ((p = route(path, '/api/articles/:id/revert')) && method === 'POST') return json(await db.revertArticle(env.DB, idOf(p.id), now));
    if ((p = route(path, '/api/articles/:id/unpublish')) && method === 'POST') return json(await db.unpublishArticle(env.DB, idOf(p.id), now));
    // The link preview the editor drew for the live version: a picture it has just uploaded here.
    if ((p = route(path, '/api/articles/:id/card')) && method === 'PUT') {
        const { card } = await readJson<{ card?: unknown }>(request);
        const src = avatarSrc(str(card, 'card', 300));
        if (!src) throw new HttpError(400, 'A preview must be a picture uploaded to this site.', 'card');
        await db.setArticleCard(env.DB, idOf(p.id), src);
        return json({ card: src });
    }
    if ((p = route(path, '/api/articles/:id/collections')) && method === 'PUT') {
        const { collectionIds } = await readJson<{ collectionIds?: unknown }>(request);
        return json(await db.setArticleCollections(env.DB, idOf(p.id), ids(collectionIds, 'collectionIds'), now));
    }

    if (path === '/api/media' && method === 'POST') return media.upload(request, env);

    // ── collections
    if (path === '/api/collections') {
        if (method === 'GET') return json(await db.listCollections(env.DB));
        if (method === 'POST') {
            const { title = '' } = await readJson<{ title?: unknown }>(request);
            return json(await db.createCollection(env.DB, str(title, 'title', 300), now), 201);
        }
    }
    if ((p = route(path, '/api/collections/:id'))) {
        const id = idOf(p.id);
        if (method === 'GET') return json(await db.getCollection(env.DB, id, now));
        if (method === 'PUT') {
            const b = await readJson<Record<string, unknown>>(request);
            const update: CollectionUpdate = {
                title: str(b.title, 'title', 300),
                slug: str(b.slug, 'slug', SLUG_MAX),
                description: str(b.description, 'description', 2000),
                articleIds: ids(b.articleIds, 'articleIds'),
                updatedAt: optionalTime(b.updatedAt, 'updatedAt') ?? 0,
            };
            return json(await db.updateCollection(env.DB, id, update, now));
        }
        if (method === 'DELETE') {
            await db.deleteCollection(env.DB, id);
            return json({ deleted: id });
        }
    }

    // ── friends
    if (path === '/api/friends') {
        if (method === 'GET') return json(await db.listFriends(env.DB));
        if (method === 'PUT') {
            const { friends } = await readJson<{ friends?: unknown }>(request);
            if (!Array.isArray(friends) || friends.length > 500) throw new HttpError(400, 'friends must be a list.', 'friends');
            const list: Friend[] = friends.map((f: Record<string, unknown>) => ({
                name: str(f?.name, 'name', 200),
                url: str(f?.url, 'url', 2000),
                note: str(f?.note, 'note', 500),
                // Only a picture this site stores; anything else is dropped rather than refused.
                avatar: avatarSrc(str(f?.avatar ?? '', 'avatar', 300)) ?? '',
            }));
            return json(await db.saveFriends(env.DB, list));
        }
    }

    // ── projects
    if (path === '/api/projects') {
        if (method === 'GET') return json(await db.listProjects(env.DB));
        if (method === 'PUT') {
            const { projects } = await readJson<{ projects?: unknown }>(request);
            if (!Array.isArray(projects) || projects.length > 200) throw new HttpError(400, 'projects must be a list.', 'projects');
            const list: Project[] = projects.map((p: Record<string, unknown>) => {
                const links = Array.isArray(p?.links) ? p.links : [];
                if (links.length > 12) throw new HttpError(400, 'A project can have twelve links at most.', 'links');
                return {
                    name: str(p?.name, 'name', 200),
                    rule: str(p?.rule, 'rule', 300),
                    about: str(p?.about, 'about', 1000),
                    // Only the addresses are taken; the previews are the Worker's own to fetch.
                    links: links.map((l: Record<string, unknown>) => ({ url: str(l?.url, 'url', 2000), preview: null })),
                };
            });
            const filled = await withPreviews(list, await db.listProjects(env.DB), now);
            return json(await db.saveProjects(env.DB, filled));
        }
    }

    throw new HttpError(404, 'There is nothing at this address.');
}

async function reader(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    const now = Date.now();
    let p: Record<string, string> | null;

    if (path === '/writing') {
        const [articles, collections] = await Promise.all([db.liveArticles(env.DB, now), db.liveCollections(env.DB, now)]);
        return respond(env, request, writingIndex(articles, collections));
    }
    if (path.startsWith('/media/')) return media.serve(request, env, path.slice('/media/'.length));
    if (path === '/sitemap.xml') {
        const [articles, collections, friends, projects] = await Promise.all([
            db.liveArticles(env.DB, now),
            db.liveCollections(env.DB, now),
            db.listFriends(env.DB),
            db.listProjects(env.DB),
        ]);
        return sitemap(url.origin, articles, collections, friendsPage(friends) !== null, projectsPage(projects) !== null);
    }
    if (path === '/projects') {
        const projects = await db.listProjects(env.DB);
        // Previews gone stale are fetched again after the page has gone out, for the next reader.
        if (anyStale(projects, now))
            ctx.waitUntil(
                withPreviews(projects, projects, now)
                    .then(fresh => db.saveProjects(env.DB, fresh))
                    .catch(e => console.error('Refreshing link previews failed', e)),
            );
        return respond(env, request, projectsPage(projects) ?? notFound());
    }
    if (path === '/friends') return respond(env, request, friendsPage(await db.listFriends(env.DB)) ?? notFound());
    if (path === '/writing/feed.xml') return feed(url.origin, await db.liveArticlesWithBodies(env.DB, now, 30));
    if ((p = route(path, '/writing/:slug'))) {
        const found = await db.liveArticle(env.DB, p.slug!, now);
        if (!found) return respond(env, request, notFound());
        if ('moved' in found) return Response.redirect(new URL(`/writing/${encodeURIComponent(found.moved)}`, url).href, 301);
        const [collections, card] = await Promise.all([db.collectionsOf(env.DB, found.article.id, now), db.articleCard(env.DB, found.article.id)]);
        return respond(env, request, { ...articlePage(found.article, collections), image: card || undefined });
    }
    if ((p = route(path, '/collections/:slug'))) {
        const c = await db.liveCollection(env.DB, p.slug!, now);
        return respond(env, request, c ? collectionPage(c) : notFound());
    }
    if ((p = route(path, '/admin/preview/:id'))) {
        if (!(await isSignedIn(request, env))) return Response.redirect(new URL('/admin/', url).href, 302);
        const row = await db.getDraft(env.DB, idOf(p.id));
        if (!row) return respond(env, request, notFound());
        const article: db.LiveArticle = {
            id: row.id,
            slug: row.slug,
            title: row.title,
            summary: row.summary,
            body: row.body,
            html: renderMarkdown(row.body),
            publishedAt: row.published_at ?? now,
            republishedAt: row.republished_at ?? row.published_at ?? now,
        };
        return respond(env, request, articlePage(article, await db.collectionsOf(env.DB, row.id, Number.MAX_SAFE_INTEGER), true));
    }
    // The bare template is not a page of its own.
    return respond(env, request, notFound());
}

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);
        try {
            if (url.pathname.startsWith('/api/')) return await api(request, env, url);
            if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
            return await reader(request, env, url, ctx);
        } catch (e) {
            if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
            console.error(e);
            return url.pathname.startsWith('/api/')
                ? json({ error: 'Something went wrong on the server.' }, 500)
                : new Response('Something went wrong.', { status: 500 });
        }
    },
} satisfies ExportedHandler<Env>;
