export interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    /** Pictures in articles, served at /media/... */
    MEDIA: R2Bucket;
    /** The editor's password. Set with `wrangler secret put ADMIN_PASSWORD`, or in .dev.vars locally. */
    ADMIN_PASSWORD?: string;
    /** Signs session cookies. Optional; changing it signs everyone out. */
    SESSION_SECRET?: string;
}
