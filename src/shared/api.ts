// The shapes the editor and the Worker pass between them. Times are milliseconds since 1970.

/** draft: never published, or taken down. scheduled: published with a date still to come. */
export type ArticleState = 'draft' | 'published' | 'scheduled';

export interface ArticleSummary {
    id: number;
    slug: string;
    title: string;
    state: ArticleState;
    /** Published, but the working copy has changed since. */
    changed: boolean;
    publishedSlug: string | null;
    publishedAt: number | null;
    updatedAt: number;
}

export interface Article extends ArticleSummary {
    summary: string;
    body: string;
    /** The live version's link preview picture, or empty when it has none yet. */
    card: string;
    republishedAt: number | null;
    createdAt: number;
    collectionIds: number[];
}

/** What the editor saves. `updatedAt` is the version it started from, so two tabs can't overwrite each other. */
export interface ArticleUpdate {
    title: string;
    slug: string;
    summary: string;
    body: string;
    publishedAt: number | null;
    updatedAt: number;
}

export interface CollectionSummary {
    id: number;
    slug: string;
    title: string;
    count: number;
    updatedAt: number;
}

export interface Collection extends CollectionSummary {
    description: string;
    articles: ArticleSummary[];
}

export interface CollectionUpdate {
    title: string;
    slug: string;
    description: string;
    articleIds: number[];
    updatedAt: number;
}

/** Someone whose site the blog points to. The address is kept as typed. */
export interface Friend {
    name: string;
    url: string;
    note: string;
    /** Their picture: an uploaded /media/ address, or empty to show their initial. */
    avatar: string;
}

export interface ApiError {
    error: string;
    field?: string;
}
