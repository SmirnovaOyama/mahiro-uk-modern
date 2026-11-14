// Saves a little after typing stops, one save at a time, and says how it went.
import { ApiFailure } from './api.ts';

export type SaveState = { kind: 'saved' } | { kind: 'unsaved' } | { kind: 'saving' } | { kind: 'error'; message: string; field?: string; stale: boolean };

export interface Autosave {
    /** Something changed; save soon. */
    touch(): void;
    /** Save now if anything is waiting. Resolves once it's saved, or rejects if it couldn't be. */
    flush(): Promise<void>;
    readonly dirty: boolean;
    stop(): void;
}

export function autosave(save: () => Promise<void>, report: (state: SaveState) => void, delay = 900): Autosave {
    let dirty = false;
    let timer: number | undefined;
    let chain: Promise<void> = Promise.resolve();
    let stopped = false;

    const run = (): Promise<void> => {
        window.clearTimeout(timer);
        const attempt = chain.then(async () => {
            if (!dirty || stopped) return;
            dirty = false;
            report({ kind: 'saving' });
            try {
                await save();
                report(dirty ? { kind: 'unsaved' } : { kind: 'saved' });
            } catch (e) {
                dirty = true;
                const failure = e instanceof ApiFailure ? e : new ApiFailure(0, String(e));
                report({ kind: 'error', message: failure.message, field: failure.field, stale: failure.status === 409 && !failure.field });
                throw failure;
            }
        });
        // A failed save leaves the chain usable for the next attempt.
        chain = attempt.catch(() => {});
        return attempt;
    };

    return {
        touch() {
            dirty = true;
            report({ kind: 'unsaved' });
            window.clearTimeout(timer);
            timer = window.setTimeout(() => void run().catch(() => {}), delay);
        },
        flush: run,
        get dirty() {
            return dirty;
        },
        stop() {
            stopped = true;
            window.clearTimeout(timer);
        },
    };
}

export function describe(state: SaveState): string {
    switch (state.kind) {
        case 'saved':
            return 'Saved';
        case 'unsaved':
            return 'Edited';
        case 'saving':
            return 'Saving…';
        case 'error':
            return state.message;
    }
}
