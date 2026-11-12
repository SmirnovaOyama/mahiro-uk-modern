# mahiro-uk-modern

The personal site of Smirnova Anya (寻寻), for mahiro.uk.

The whole page is a single sentence on a white page:

> Hello, and welcome. I’m <u>Anya</u>. I build <u>quiet software</u>. I am unreservedly devoted to <u>a certain anime girl</u>, and I read <u>every letter</u>.

Each dotted phrase unfolds into a longer one, which may hold further dotted phrases of its own. Opened all the way, the sentence becomes a full introduction: where I am and what the time is there, what the pixel cat is doing, the projects I keep, and how to reach me.

## How it moves

When a phrase opens, the letters are treated as pieces of type rather than text being swapped:

- letters the old and new sentences share glide from where they were to where they now belong, the far ones in a low arc;
- new letters soak in from the word you tapped, starting in terracotta and drying to ink;
- pictures (the avatar, the cat, the app icon, the GitHub mark, the envelope) travel with the letters.

The real sentence is never taken apart. It is laid out once in its final shape and hidden, while copies of its letters move in a layer above it, each snapped onto the exact position of the letter it stands for. When they land, the layer is removed and the real text appears in the same place, so the last frame and the settled page are identical in every browser. Underlines step aside while the type moves and fade back once it has landed. Visitors who ask their system for reduced motion get the change without animation.

The details are in [`src/transition.ts`](src/transition.ts).

## Running it

Requires Node 24 or later (the build scripts are TypeScript run directly by Node).

```bash
npm install
npm run dev        # http://localhost:4173
npm run build      # type-checks, then writes a static site to dist/
npm run preview    # serves dist/ locally
```

`dist/` is plain HTML, CSS and JavaScript with relative paths, so any static host will serve it.

## Deploying

The site is deployed on Cloudflare. [`wrangler.jsonc`](wrangler.jsonc) tells `wrangler deploy` to upload `dist/` as static assets, with no Worker script, so Cloudflare's build only needs `npm run build` as the build command and `npx wrangler deploy` as the deploy command. To check a deploy without publishing it:

```bash
npm run build && npx wrangler deploy --dry-run
```

## Changing the words

All copy lives in [`src/i18n.ts`](src/i18n.ts). The sentence starts from `root`, and every phrase is a node with a folded `label` and the `body` it opens into. Inside a body:

| Token | Becomes |
| --- | --- |
| `{>id}` | another node, folded until someone opens it |
| `{$time}`, `{$day}`, `{$state}` | the time and weekday at UTC+8, and what the cat is doing at that hour |
| `{$catpic}`, `{$avatar}` | the pixel cat, or my avatar, at the size of a word |
| `{@key\|text}` | a link from [`src/config.ts`](src/config.ts); without `text`, the link’s own address |

Links, the email address and the time zone are in `src/config.ts`. Only English is written for now; the comment at the top of `src/i18n.ts` explains how to add another language.

## Checking for awkward moments

With `npm run dev` running, open the browser console and run:

```js
await awkward()
```

It takes about two minutes and returns a list of problems, empty when there are none. At six widths from 320 to 1440 pixels it checks:

- every combination of open phrases a visitor can reach, for lines that begin with stranded punctuation, a lone "I" or "a" left at the end of a line, dotted phrases split over two lines, punctuation that breaks in partly-open states (such as `;,`), link icons separated from their words, and sideways scrolling;
- every unfolding animation, comparing its last frame with where each letter finally sits (anything over 0.75 px counts as a jump), and that the page is fully shown again afterwards.

The checker lives in [`src/dev/awkward.ts`](src/dev/awkward.ts) and is loaded only in development, never in the built site. It runs in whichever browser you open it in, so run it in Safari as well as Chrome when layout changes.

## Design

Colours, spacing, radii and shadows come from the design system of [Oyama’s HRT Tracker](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker). Its tokens are copied as they are into [`design/tokens.json`](design/tokens.json), and `npm run tokens` turns them into `src/styles/tokens.css` with light and dark themes; nothing in the stylesheets is a hard-coded colour. The pixel cats and their animation are the tracker’s own, carried over unchanged, and the hand-drawn icons are drawn in the same pen as the tracker’s doodles.

## Link preview

When a link to the site is shared, it shows `public/og.png`: the folded sentence as a visitor first sees it, with the address and a sleeping cat. The picture is drawn as a page, [`og.html`](og.html), and photographed with headless Chrome:

```bash
npm run dev    # in one terminal
npm run og     # in another; rewrites public/og.png
```

Rerun it whenever the opening sentence changes. The tags in `index.html` point at `https://mahiro.uk/og.png`, so the image only appears in previews once the site is live at that address.

## Pixel cat favicon

`npm run favicon` draws the curled-up pixel cat as `public/favicon.svg`. The site currently uses my avatar as its icon instead, so that file is spare.

## Layout of the code

```
index.html            the page shell
src/main.ts           builds the sentence, the bottom hint, the leaving-the-site note and the theme switch
src/i18n.ts           every word on the page
src/config.ts         links, email, time zone
src/transition.ts     the letter-by-letter animation
src/cat.ts            the pixel cats, ported from the tracker
src/doodle.ts         hand-drawn icons
src/icons.ts          Lucide outlines and the GitHub mark
src/styles/           generated tokens, the cats' motion, and the site's own styles
src/dev/awkward.ts    development-only layout checks
og.html, src/og.ts    the link preview picture, as a page
scripts/              token, favicon and link-preview generators
public/               avatar, app icon, site icons and og.png
```

## Pictures

My avatar (`public/avatar.jpg` and the site icons made from it) and the tracker’s app icon (`public/icons/hrt.png`) are artwork, not code, and are not licensed for reuse with it. Oyama Mahiro is the protagonist of *Onii-chan wa Oshimai!* and belongs to her creators; the site only links to her.
