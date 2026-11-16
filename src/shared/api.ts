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

/** What a link turned out to be, fetched by the Worker when the project was saved. */
export interface LinkPreview {
    /** A repository's description, or a website's title. */
    title: string;
    /** A website's description; empty for a repository, whose description is its title. */
    description: string;
    /** A website's picture (its og:image), as an absolute address; empty if it has none. */
    image: string;
    /** A repository's main language. */
    language: string;
    stars: number | null;
    /** When a repository last changed, in milliseconds. */
    updated: number | null;
}

/** One of a project's links: a repository on GitHub or GitLab, or a website. The address is kept as typed. */
export interface ProjectLink {
    url: string;
    /** Null until fetched, or when it couldn't be. */
    preview: LinkPreview | null;
    /** When the preview was last asked for, in milliseconds. */
    fetchedAt?: number;
}

/** Something I make, for the projects page. */
export interface Project {
    name: string;
    /** The one thing it will not do, or always does; the page leads with this. */
    rule: string;
    /** What it is, in a line. */
    about: string;
    links: ProjectLink[];
}

export interface ApiError {
    error: string;
    field?: string;
}
