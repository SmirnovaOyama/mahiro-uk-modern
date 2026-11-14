export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly field?: string,
    ) {
        super(message);
    }
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
    });

export async function readJson<T>(request: Request): Promise<T> {
    try {
        return (await request.json()) as T;
    } catch {
        throw new HttpError(400, 'The request body is not JSON.');
    }
}

export const str = (v: unknown, field: string, max = 200_000): string => {
    if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`, field);
    if (v.length > max) throw new HttpError(400, `${field} is too long.`, field);
    return v;
};

export const optionalTime = (v: unknown, field: string): number | null => {
    if (v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `${field} must be a time.`, field);
    return Math.round(v);
};

export const ids = (v: unknown, field: string): number[] => {
    if (!Array.isArray(v) || !v.every(n => Number.isInteger(n))) throw new HttpError(400, `${field} must be a list of ids.`, field);
    return [...new Set(v as number[])];
};
