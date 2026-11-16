-- Each published article's link preview picture: a /media/ address, drawn by
-- the editor when the article is published, or empty to use the site's own.

ALTER TABLE articles ADD COLUMN published_card TEXT NOT NULL DEFAULT '';
