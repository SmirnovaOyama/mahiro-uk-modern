import assert from 'node:assert/strict';
import { test } from 'node:test';
import { figureReferences, rewriteFigures, importMarkdownFolder } from '../src/admin/markdown-import.ts';

const sample = [
    '## Results',
    '| Group | Count |',
    '| --- | --- |',
    '| A | 42 |',
    '',
    '![Figure 1](figures/one.png "Original caption")',
    '![Figure 2](<figures/two space.png> "Another caption")',
    '![Remote](https://example.org/remote.png)',
    '~~~mermaid',
    '![Example](figures/not-real.png)',
    '~~~',
    '![Repeat](figures/one.png)',
].join('\n');

test('preserves tables, captions, remote URLs and code while rewriting relative images', () => {
    const refs = figureReferences(sample, 'report/paper.md');
    assert.deepEqual(refs.map(r => r.path), [
        'report/figures/one.png', 'report/figures/two space.png', 'report/figures/one.png',
    ]);
    const result = rewriteFigures(sample, refs, new Map([
        ['report/figures/one.png', '/media/one.png'],
        ['report/figures/two space.png', '/media/two.png'],
    ]));
    assert.equal(result, sample.replaceAll('figures/one.png', '/media/one.png').replace('figures/two space.png', '/media/two.png'));
});

function file(path: string, contents: string, type = ''): File {
    const f = new File([contents], path.split('/').pop()!, { type });
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
}

test('validates all figures before uploading and uploads repeated references once', async () => {
    const doc = file('report/paper.md', sample);
    const one = file('report/figures/one.png', 'one', 'image/png');
    const two = file('report/figures/two space.png', 'two', 'image/png');
    let uploads = 0;
    const upload = async () => ({ url: '/media/' + ++uploads + '.png' });
    await assert.rejects(importMarkdownFolder([doc, one], upload), /Missing/);
    assert.equal(uploads, 0);
    const result = await importMarkdownFolder([doc, one, two], upload);
    assert.equal(uploads, 2);
    assert.equal(result.match(/\/media\/1\.png/g)?.length, 2);
});
