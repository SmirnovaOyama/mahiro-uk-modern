-- Articles, collections and the links between them.
--
-- An article keeps two copies of itself. The working copy (slug, title,
-- summary, body) is what the editor saves as you type. The published copy
-- (published_*) is what readers see, and only changes when you press Publish.
-- So a published article can be reworked in the editor without readers seeing
-- half-finished sentences.

CREATE TABLE articles (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',

    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_slug TEXT UNIQUE,
    published_title TEXT,
    published_summary TEXT,
    published_body TEXT,
    published_html TEXT,
    -- The date readers see. May lie in the future: the article then waits, unseen, until it arrives.
    published_at INTEGER,
    -- The last time Publish was pressed.
    republished_at INTEGER,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX articles_live ON articles (status, published_at);

-- Old addresses of an article, so links to it keep working after its slug changes.
CREATE TABLE slug_redirects (
    slug TEXT PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles (id) ON DELETE CASCADE
);

CREATE TABLE collections (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE collection_articles (
    collection_id INTEGER NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    article_id INTEGER NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (collection_id, article_id)
);
CREATE INDEX collection_articles_article ON collection_articles (article_id);
