import type { ApiError, Article, ArticleSummary, ArticleUpdate, Collection, CollectionSummary, CollectionUpdate, Friend, Project } from '../shared/api.ts';

export class ApiFailure extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly field?: string,
    ) {
        super(message);
    }
}

let signedOut: () => void = () => {};
/** Called when the server says the session has run out mid-work. */
export const onSignedOut = (fn: () => void): void => void (signedOut = fn);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    const raw = body instanceof Blob;
    try {
        res = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers: body === undefined ? {} : { 'content-type': raw ? body.type : 'application/json' },
            body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
        });
    } catch {
        throw new ApiFailure(0, 'Can’t reach the server. Check the connection.');
    }
    const data = (await res.json().catch(() => ({ error: `The server answered ${res.status}.` }))) as T & ApiError;
    if (!res.ok) {
        if (res.status === 401 && path !== '/api/session') signedOut();
        throw new ApiFailure(res.status, data.error ?? 'Something went wrong.', data.field);
    }
    return data;
}

export const api = {
    session: () => call<{ signedIn: boolean; configured: boolean }>('GET', '/api/session'),
    signIn: (password: string) => call<{ signedIn: boolean }>('POST', '/api/session', { password }),
    signOut: () => call<{ signedIn: boolean }>('DELETE', '/api/session'),

    articles: () => call<ArticleSummary[]>('GET', '/api/articles'),
    article: (id: number) => call<Article>('GET', `/api/articles/${id}`),
    createArticle: (title = '') => call<Article>('POST', '/api/articles', { title }),
    saveArticle: (id: number, update: ArticleUpdate) => call<Article>('PUT', `/api/articles/${id}`, update),
    deleteArticle: (id: number) => call<{ deleted: number }>('DELETE', `/api/articles/${id}`),
    publish: (id: number) => call<Article>('POST', `/api/articles/${id}/publish`),
    revert: (id: number) => call<Article>('POST', `/api/articles/${id}/revert`),
    unpublish: (id: number) => call<Article>('POST', `/api/articles/${id}/unpublish`),
    setCard: (id: number, card: string) => call<{ card: string }>('PUT', `/api/articles/${id}/card`, { card }),
    setArticleCollections: (id: number, collectionIds: number[]) => call<Article>('PUT', `/api/articles/${id}/collections`, { collectionIds }),

    upload: (file: Blob) => call<{ url: string }>('POST', '/api/media', file),

    collections: () => call<CollectionSummary[]>('GET', '/api/collections'),
    collection: (id: number) => call<Collection>('GET', `/api/collections/${id}`),
    createCollection: (title = '') => call<Collection>('POST', '/api/collections', { title }),
    saveCollection: (id: number, update: CollectionUpdate) => call<Collection>('PUT', `/api/collections/${id}`, update),
    deleteCollection: (id: number) => call<{ deleted: number }>('DELETE', `/api/collections/${id}`),

    friends: () => call<Friend[]>('GET', '/api/friends'),
    saveFriends: (friends: Friend[]) => call<Friend[]>('PUT', '/api/friends', { friends }),

    projects: () => call<Project[]>('GET', '/api/projects'),
    /** Saves the list; the answer carries what the Worker found at each link. */
    saveProjects: (projects: Project[]) =>
        call<Project[]>('PUT', '/api/projects', { projects: projects.map(p => ({ ...p, links: p.links.map(l => ({ url: l.url })) })) }),
};
