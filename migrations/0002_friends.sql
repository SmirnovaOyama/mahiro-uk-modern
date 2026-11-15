-- The people whose sites the blog points to, in the order they're shown.
-- The address is kept as typed; the page shows only rows whose address works.

CREATE TABLE friends (
    position INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
);
