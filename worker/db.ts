import type { Article, ArticleState, ArticleSummary, ArticleUpdate, Collection, CollectionSummary, CollectionUpdate, Friend } from '../src/shared/api.ts';
import { renderMarkdown, SLUG, slugify } from '../src/shared/markdown.ts';
import { HttpError } from './http.ts';

interface ArticleRow {
    id: number;
    slug: string;
    title: string;
    summary: string;
    body: string;
    status: 'draft' | 'published';
    published_slug: string | null;
    published_title: string | null;
    published_summary: string | null;
    published_body: string | null;
    published_html: string | null;
    published_at: number | null;
    republished_at: number | null;
    created_at: number;
    updated_at: number;
}

interface CollectionRow {
    id: number;
    slug: string;
    title: string;
    description: string;
    created_at: number;
    updated_at: number;
}

/** Whether a published article's working copy has moved on from what readers see. */
const changed = (t = ''): string =>
    `(${t}status = 'published' AND (${t}title IS NOT ${t}published_title OR ${t}slug IS NOT ${t}published_slug OR ` +
    `${t}summary IS NOT ${t}published_summary OR ${t}body IS NOT ${t}published_body)) AS changed`;

/** Everything but the bodies, for lists. `t` is a table alias with its dot. */
const summaryColumns = (t = ''): string =>
    ['id', 'slug', 'title', 'status', 'published_slug', 'published_at', 'updated_at'].map(c => t + c).join(', ') + ', ' + changed(t);

type SummaryRow = Pick<ArticleRow, 'id' | 'slug' | 'title' | 'status' | 'published_slug' | 'published_at' | 'updated_at'> & { changed: number };

function stateOf(row: { status: string; published_at: number | null }, now: number): ArticleState {
    if (row.status !== 'published') return 'draft';
    return (row.published_at ?? 0) > now ? 'scheduled' : 'published';
}

const toSummary = (row: SummaryRow, now: number): ArticleSummary => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    state: stateOf(row, now),
    changed: Boolean(row.changed),
    publishedSlug: row.published_slug,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
});

function checkSlug(slug: string): string {
    if (!SLUG.test(slug)) throw new HttpError(400, 'An address may only hold letters, numbers and single dashes.', 'slug');
    if (slug.length > 80) throw new HttpError(400, 'That address is too long.', 'slug');
    return slug;
}

/** A slug like `base`, `base-2`, `base-3`… that no row in `table` has yet. */
async function freeSlug(db: D1Database, table: 'articles' | 'collections', base: string): Promise<string> {
    const taken = new Set(
        (await db.prepare(`SELECT slug FROM ${table} WHERE slug = ?1 OR slug LIKE ?1 || '-%'`).bind(base).all<{ slug: string }>()).results.map(r => r.slug),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const isUniqueError = (e: unknown): boolean => e instanceof Error && /UNIQUE constraint failed/i.test(e.message);

// ── articles, for the editor ───────────────────────────────────────────

export async function listArticles(db: D1Database, now: number): Promise<ArticleSummary[]> {
    const { results } = await db.prepare(`SELECT ${summaryColumns()} FROM articles ORDER BY updated_at DESC`).all<SummaryRow>();
    return results.map(r => toSummary(r, now));
}

export async function getArticle(db: D1Database, id: number, now: number): Promise<Article> {
    const [row, memberships] = await db.batch([
        db.prepare(`SELECT *, ${changed()} FROM articles WHERE id = ?`).bind(id),
        db.prepare('SELECT collection_id FROM collection_articles WHERE article_id = ?').bind(id),
    ]);
    const article = row!.results[0] as (ArticleRow & { changed: number }) | undefined;
    if (!article) throw new HttpError(404, 'There is no such article.');
    return {
        ...toSummary(article, now),
        summary: article.summary,
        body: article.body,
        republishedAt: article.republished_at,
        createdAt: article.created_at,
        collectionIds: (memberships!.results as { collection_id: number }[]).map(r => r.collection_id),
    };
}

export async function createArticle(db: D1Database, title: string, now: number): Promise<Article> {
    const slug = await freeSlug(db, 'articles', slugify(title) || 'untitled');
    const row = await db
        .prepare('INSERT INTO articles (slug, title, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id')
        .bind(slug, title, now, now)
        .first<{ id: number }>();
    return getArticle(db, row!.id, now);
}

export async function updateArticle(db: D1Database, id: number, update: ArticleUpdate, now: number): Promise<Article> {
    checkSlug(update.slug);
    try {
        const result = await db
            .prepare(
                // A published article always keeps a date; an empty one leaves it as it was.
                'UPDATE articles SET title = ?, slug = ?, summary = ?, body = ?, ' +
                    "published_at = CASE WHEN status = 'published' THEN COALESCE(?5, published_at) ELSE ?5 END, " +
                    'updated_at = ? WHERE id = ? AND updated_at = ?',
            )
            .bind(update.title, update.slug, update.summary, update.body, update.publishedAt, Math.max(now, update.updatedAt + 1), id, update.updatedAt)
            .run();
        if (result.meta.changes === 0) {
            const exists = await db.prepare('SELECT 1 FROM articles WHERE id = ?').bind(id).first();
            if (!exists) throw new HttpError(404, 'There is no such article.');
            throw new HttpError(409, 'This article was changed somewhere else. Reload to see the newer version.');
        }
    } catch (e) {
        if (isUniqueError(e)) throw new HttpError(409, 'Another article already uses that address.', 'slug');
        throw e;
    }
    return getArticle(db, id, now);
}

export async function deleteArticle(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM articles WHERE id = ?').bind(id).run();
}

/**
 * Copies the working copy over the published one and renders it. The first
 * publication fixes the date readers see, unless a date was chosen; later
 * ones keep it. A changed slug leaves the old address behind as a redirect.
 */
export async function publishArticle(db: D1Database, id: number, now: number): Promise<Article> {
    const row = await db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<ArticleRow>();
    if (!row) throw new HttpError(404, 'There is no such article.');
    if (!row.title.trim()) throw new HttpError(400, 'Give the article a title before publishing it.', 'title');

    const clash = await db
        .prepare('SELECT title FROM articles WHERE published_slug = ? AND id <> ?')
        .bind(row.slug, id)
        .first<{ title: string }>();
    if (clash) throw new HttpError(409, `“${clash.title}” is published at that address already.`, 'slug');

    const statements = [
        db
            .prepare(
                `UPDATE articles SET status = 'published', published_slug = slug, published_title = title,
                 published_summary = summary, published_body = body, published_html = ?,
                 published_at = COALESCE(published_at, ?), republished_at = ? WHERE id = ?`,
            )
            .bind(renderMarkdown(row.body), now, now, id),
        // The new address is live now, so it can no longer point anywhere else.
        db.prepare('DELETE FROM slug_redirects WHERE slug = ?').bind(row.slug),
    ];
    if (row.published_slug && row.published_slug !== row.slug) {
        statements.push(db.prepare('INSERT OR REPLACE INTO slug_redirects (slug, article_id) VALUES (?, ?)').bind(row.published_slug, id));
    }
    await db.batch(statements);
    return getArticle(db, id, now);
}

/** Takes the article down. Its published copy is kept, so nothing is lost, but its address is freed. */
export async function unpublishArticle(db: D1Database, id: number, now: number): Promise<Article> {
    await db.prepare("UPDATE articles SET status = 'draft', published_slug = NULL WHERE id = ?").bind(id).run();
    return getArticle(db, id, now);
}

/** Throws away the working copy's changes: it becomes what readers see again. */
export async function revertArticle(db: D1Database, id: number, now: number): Promise<Article> {
    const result = await db
        .prepare(
            `UPDATE articles SET slug = published_slug, title = published_title, summary = published_summary,
             body = published_body, updated_at = MAX(?, updated_at + 1) WHERE id = ? AND status = 'published'`,
        )
        .bind(now, id)
        .run();
    if (result.meta.changes === 0) throw new HttpError(409, 'Only a published article has a version to go back to.');
    return getArticle(db, id, now);
}

export async function setArticleCollections(db: D1Database, articleId: number, collectionIds: number[], now: number): Promise<Article> {
    const current = (await db.prepare('SELECT collection_id FROM collection_articles WHERE article_id = ?').bind(articleId).all<{ collection_id: number }>())
        .results.map(r => r.collection_id);
    const statements: D1PreparedStatement[] = [];
    for (const cid of current) {
        if (!collectionIds.includes(cid)) {
            statements.push(db.prepare('DELETE FROM collection_articles WHERE collection_id = ? AND article_id = ?').bind(cid, articleId));
        }
    }
    for (const cid of collectionIds) {
        if (!current.includes(cid)) {
            // New members go to the end of the collection.
            statements.push(
                db
                    .prepare(
                        'INSERT INTO collection_articles (collection_id, article_id, position) SELECT ?1, ?2, COALESCE(MAX(position) + 1, 0) FROM collection_articles WHERE collection_id = ?1',
                    )
                    .bind(cid, articleId),
            );
        }
    }
    if (statements.length) {
        const touched = [...new Set([...current, ...collectionIds])];
        statements.push(db.prepare(`UPDATE collections SET updated_at = ? WHERE id IN (${touched.map(() => '?').join(',')})`).bind(now, ...touched));
        try {
            await db.batch(statements);
        } catch (e) {
            if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) throw new HttpError(400, 'One of those collections does not exist.');
            throw e;
        }
    }
    return getArticle(db, articleId, now);
}

/** The working copy as an article page, for previewing a draft. */
export async function getDraft(db: D1Database, id: number): Promise<ArticleRow | null> {
    return db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<ArticleRow>();
}

// ── collections, for the editor ────────────────────────────────────────

export async function listCollections(db: D1Database): Promise<CollectionSummary[]> {
    const { results } = await db
        .prepare(
            `SELECT c.id, c.slug, c.title, c.updated_at, COUNT(ca.article_id) AS count
             FROM collections c LEFT JOIN collection_articles ca ON ca.collection_id = c.id
             GROUP BY c.id ORDER BY c.title COLLATE NOCASE`,
        )
        .all<{ id: number; slug: string; title: string; updated_at: number; count: number }>();
    return results.map(r => ({ id: r.id, slug: r.slug, title: r.title, count: r.count, updatedAt: r.updated_at }));
}

export async function getCollection(db: D1Database, id: number, now: number): Promise<Collection> {
    const [row, members] = await db.batch([
        db.prepare('SELECT * FROM collections WHERE id = ?').bind(id),
        db.prepare(
            `SELECT ${summaryColumns('a.')}
             FROM collection_articles ca JOIN articles a ON a.id = ca.article_id
             WHERE ca.collection_id = ? ORDER BY ca.position`,
        ).bind(id),
    ]);
    const c = row!.results[0] as CollectionRow | undefined;
    if (!c) throw new HttpError(404, 'There is no such collection.');
    const articles = (members!.results as SummaryRow[]).map(r => toSummary(r, now));
    return { id: c.id, slug: c.slug, title: c.title, description: c.description, count: articles.length, updatedAt: c.updated_at, articles };
}

export async function createCollection(db: D1Database, title: string, now: number): Promise<Collection> {
    const slug = await freeSlug(db, 'collections', slugify(title) || 'collection');
    const row = await db
        .prepare('INSERT INTO collections (slug, title, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id')
        .bind(slug, title, now, now)
        .first<{ id: number }>();
    return getCollection(db, row!.id, now);
}

export async function updateCollection(db: D1Database, id: number, update: CollectionUpdate, now: number): Promise<Collection> {
    checkSlug(update.slug);
    // One batch, so it all happens or none of it does. The first statement only
    // succeeds against the version the editor started from, and stamps a new
    // version; the rest only run if that stamp is there.
    const version = Math.max(now, update.updatedAt + 1);
    const stamped = 'EXISTS (SELECT 1 FROM collections WHERE id = ? AND updated_at = ?)';
    const statements = [
        db
            .prepare('UPDATE collections SET title = ?, slug = ?, description = ?, updated_at = ? WHERE id = ? AND updated_at = ?')
            .bind(update.title, update.slug, update.description, version, id, update.updatedAt),
        db.prepare(`DELETE FROM collection_articles WHERE collection_id = ? AND ${stamped}`).bind(id, id, version),
        ...update.articleIds.map((articleId, position) =>
            db
                .prepare(`INSERT INTO collection_articles (collection_id, article_id, position) SELECT ?, ?, ? WHERE ${stamped}`)
                .bind(id, articleId, position, id, version),
        ),
    ];
    let results: D1Result[];
    try {
        results = await db.batch(statements);
    } catch (e) {
        if (isUniqueError(e)) throw new HttpError(409, 'Another collection already uses that address.', 'slug');
        if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) throw new HttpError(400, 'One of those articles does not exist.');
        throw e;
    }
    if (results[0]!.meta.changes === 0) {
        const exists = await db.prepare('SELECT 1 FROM collections WHERE id = ?').bind(id).first();
        if (!exists) throw new HttpError(404, 'There is no such collection.');
        throw new HttpError(409, 'This collection was changed somewhere else. Reload to see the newer version.');
    }
    return getCollection(db, id, now);
}

export async function deleteCollection(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM collections WHERE id = ?').bind(id).run();
}

// ── what readers see ───────────────────────────────────────────────────

export interface LiveArticle {
    id: number;
    slug: string;
    title: string;
    summary: string;
    html: string;
    body: string;
    publishedAt: number;
    republishedAt: number;
}

const LIVE = "status = 'published' AND published_at <= ?";
const LIVE_COLUMNS =
    'id, published_slug AS slug, published_title AS title, published_summary AS summary, published_at AS publishedAt, republished_at AS republishedAt';

export type LiveListing = Omit<LiveArticle, 'html' | 'body'>;

export async function liveArticles(db: D1Database, now: number, limit = 1000): Promise<LiveListing[]> {
    const { results } = await db
        .prepare(`SELECT ${LIVE_COLUMNS} FROM articles WHERE ${LIVE} ORDER BY published_at DESC LIMIT ?`)
        .bind(now, limit)
        .all<LiveListing>();
    return results;
}

export async function liveArticlesWithBodies(db: D1Database, now: number, limit: number): Promise<LiveArticle[]> {
    const { results } = await db
        .prepare(`SELECT ${LIVE_COLUMNS}, published_html AS html, published_body AS body FROM articles WHERE ${LIVE} ORDER BY published_at DESC LIMIT ?`)
        .bind(now, limit)
        .all<LiveArticle>();
    return results;
}

/** The article at this address, or where it moved to, or nothing. */
export async function liveArticle(db: D1Database, slug: string, now: number): Promise<{ article: LiveArticle } | { moved: string } | null> {
    const article = await db
        .prepare(`SELECT ${LIVE_COLUMNS}, published_html AS html, published_body AS body FROM articles WHERE published_slug = ? AND ${LIVE}`)
        .bind(slug, now)
        .first<LiveArticle>();
    if (article) return { article };
    const moved = await db
        .prepare(`SELECT a.published_slug AS slug FROM slug_redirects r JOIN articles a ON a.id = r.article_id WHERE r.slug = ? AND a.status = 'published' AND a.published_at <= ?`)
        .bind(slug, now)
        .first<{ slug: string }>();
    return moved ? { moved: moved.slug } : null;
}

export interface LiveCollection {
    id: number;
    slug: string;
    title: string;
    description: string;
    articles: LiveListing[];
}

/** Collections with at least one article out, each with its live articles in order. */
export async function liveCollections(db: D1Database, now: number, where = '1 = 1', ...params: unknown[]): Promise<LiveCollection[]> {
    const { results } = await db
        .prepare(
            `SELECT c.id AS cid, c.slug AS cslug, c.title AS ctitle, c.description AS cdescription,
                    a.id, a.published_slug AS slug, a.published_title AS title, a.published_summary AS summary,
                    a.published_at AS publishedAt, a.republished_at AS republishedAt
             FROM collections c
             JOIN collection_articles ca ON ca.collection_id = c.id
             JOIN articles a ON a.id = ca.article_id AND a.status = 'published' AND a.published_at <= ?
             WHERE ${where}
             ORDER BY c.title COLLATE NOCASE, ca.position`,
        )
        .bind(now, ...params)
        .all<LiveListing & { cid: number; cslug: string; ctitle: string; cdescription: string }>();
    const byId = new Map<number, LiveCollection>();
    for (const { cid, cslug, ctitle, cdescription, ...article } of results) {
        let c = byId.get(cid);
        if (!c) byId.set(cid, (c = { id: cid, slug: cslug, title: ctitle, description: cdescription, articles: [] }));
        c.articles.push(article);
    }
    return [...byId.values()];
}

export const liveCollection = async (db: D1Database, slug: string, now: number): Promise<LiveCollection | null> =>
    (await liveCollections(db, now, 'c.slug = ?', slug))[0] ?? null;

/** The collections an article belongs to, for "part 2 of 5" and the next and previous parts. */
export const collectionsOf = (db: D1Database, articleId: number, now: number): Promise<LiveCollection[]> =>
    liveCollections(db, now, 'c.id IN (SELECT collection_id FROM collection_articles WHERE article_id = ?)', articleId);

// ── friends

export async function listFriends(db: D1Database): Promise<Friend[]> {
    // Until migration 0003 reaches a database, it has no avatar column; the page
    // still shows everyone, just with their initials, rather than failing.
    const { results } = await db
        .prepare('SELECT name, url, note, avatar FROM friends ORDER BY position')
        .all<Friend>()
        .catch(async (error: unknown) => {
            if (!String(error).includes('no such column')) throw error;
            const old = await db.prepare("SELECT name, url, note, '' AS avatar FROM friends ORDER BY position").all<Friend>();
            return old;
        });
    return results;
}

/** Puts the whole list in place at once, in the order given. */
export async function saveFriends(db: D1Database, friends: Friend[]): Promise<Friend[]> {
    const insert = db.prepare('INSERT INTO friends (position, name, url, note, avatar) VALUES (?, ?, ?, ?, ?)');
    await db.batch([db.prepare('DELETE FROM friends'), ...friends.map((f, i) => insert.bind(i, f.name, f.url, f.note, f.avatar))]);
    return listFriends(db);
}
