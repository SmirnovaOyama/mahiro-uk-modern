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
cp .dev.vars.example .dev.vars   # the editor's password for local use; never committed
npm run dev        # http://localhost:4173, with the Worker and a local database
npm run build      # type-checks the pages and the Worker, then writes dist/
npm run preview    # serves the built site and Worker locally
```

`npm run dev` applies any new database migrations to the local database first (`npm run db:migrate:local`). The local database lives in `.wrangler/`.

## Writing

Besides the sentence, the site publishes articles, written in markdown.

- **Readers** find them at `/writing`, each at `/writing/<slug>`, and collections at `/collections/<slug>`. An article in a collection carries a bar frozen to the bottom of the screen, like the one under the sentence, with the way to the parts either side. Feed readers find `/writing/feed.xml`, and search engines `/sitemap.xml`.
- **The editor** is at `/admin/`, signed in with `ADMIN_PASSWORD`. An article is a title, a summary and its markdown, set in the reading page's type. It saves as you type (⌘S saves at once); ⌘B, ⌘I, ⌘K and ⌘E format, and lists carry on when you press Enter. Paste or drop a picture into the text and it is uploaded and linked where the caret is. While you type, the bar above steps back until the pointer moves; ⌘\\ puts the list away altogether. A new article left blank is thrown away when you leave it.
- **Markdown** is GitHub's, plus footnotes (`text[^1]` and `[^1]: the note`), typographer's quotes and dashes, and figures: a picture on a line of its own with a title, `![alt](src "Caption")`, gets that caption under it. LaTeX goes between dollar signs, `$e^{i\pi}$` in a line, `$$ … $$` or a ```` ```math ```` block for one of its own; KaTeX sets it when the article is published, and its styles and fonts load only on pages that have math. Inline `\( … \)` and display `\[ … \]` delimiters also work. A price like $5 is left alone.
- **Mermaid** diagrams use a ```` ```mermaid ```` block. The reader loads the renderer on pages with a diagram and keeps the source visible if it cannot draw it. Use a ```` ```latex ```` block to show LaTeX document or TikZ source.
- **Publishing.** Readers see an article only once it's published, and edits to a published article stay out of sight until you press Publish changes. Discard changes puts the working copy back to what readers see. Unpublish takes it down; nothing is deleted.
- **Addresses** are made from the title, and fixed once an article has been published, so links to it keep working.
- **Collections** are articles in reading order: drag a row to move it, or use ⌥↑ and ⌥↓ (on a phone, the arrows beside it). Readers see only the published ones.
- **Friends** are a name, an address and a line about each, typed straight into the list and saved as you go; Enter moves down the row and on to a new one. Readers find them at `/friends`, and the blog's header links there once someone's on it. An address that doesn't work yet shows in red and stays off the page.

- **Moving between pages** (the sentence, the blog, pieces in the editor), the old page drifts and goes out of focus while the new one settles and comes into focus, opacity, blur and movement each on their own curve ([`src/styles/motion.css`](src/styles/motion.css)). Going deeper or to the next part comes in from the right, going back from the left. It uses the browser's view transitions, so browsers without them simply change page, and it is off for anyone who asks for less motion.
- **Right-click** brings up a small menu of what fits where you clicked: formatting and pictures in the text, open, preview, copy link or delete on an article in the list, moving a row in a collection, and on reading pages a link to the page or the section you're in, the parts either side and the theme. Links, pictures and selected words keep the browser's own menu, and so does a right-click with Shift held, a second right-click, or a long press on a phone.

Signing in sets a signed, HttpOnly, SameSite=Strict cookie that lasts 30 days. Setting or changing `SESSION_SECRET` signs every session out.

## Deploying

The site is deployed on Cloudflare as a Worker with static assets, a D1 database for the writing and an R2 bucket for its pictures. Static files (the sentence, the editor's page, pictures) are served directly; only the paths listed in `run_worker_first` in [`wrangler.jsonc`](wrangler.jsonc) reach the Worker ([`worker/index.ts`](worker/index.ts)).

The database (`mahiro-uk-writing`) and picture bucket (`mahiro-uk-media`) already exist, with their ids in `wrangler.jsonc`; pull-request previews built by Workers Builds (`wrangler preview`) use a separate pair, `mahiro-uk-writing-preview` and `mahiro-uk-media-preview`, so a preview never touches the live site. The one thing left to do once is the editor's password:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET          # optional: any long random string
```

A new file in `migrations/` is applied to the live database by `npm run deploy`; apply it to the preview database too, through a config that names it as `DB`.

Then, for each deploy:

```bash
npm run deploy     # builds, applies migrations to the live database, deploys
```

In Cloudflare's own build, use `npm run build` as the build command and `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` as the deploy command.

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

Each article gets a preview picture of its own: its title beside my avatar, its summary, the blog's address and the sleeping cat, drawn by the editor ([`src/admin/card.ts`](src/admin/card.ts)) every time the article is published, uploaded to R2, and named in the article page's `og:image`. An article published before cards existed gets one the next time it is opened in the editor. Drawing happens in the browser, so Chinese and Japanese titles use the same system fonts as the site and the Worker needs no image library. Migration `0004` adds the column that remembers it.

Every other page, including the home page, shows `public/og.png`: the folded sentence as a visitor first sees it, with the address and a sleeping cat. The picture is drawn as a page, [`og.html`](og.html), and photographed with headless Chrome:

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
page.html             the shell the Worker fills in for every reading page
admin/index.html      the editor's page
src/site.ts           the one script for the sentence and the reading pages
src/router.ts         moves between pages in place: links, Back and Forward, scroll, the handover
src/home.ts           builds the sentence, the bottom hint, the leaving-the-site note and the theme switch
src/reading.ts        the reading pages' theme switch and right-click menu
src/theme.ts          the light/dark switch, shared by every page
src/admin/            the editor: sign-in, lists, the article, collection and friends editors, autosave
src/shared/           markdown rendering and the API's types, shared by the editor and the Worker
worker/               the Worker: routes, sign-in, database queries, pictures, reading pages, the feed and the sitemap
migrations/           the D1 database's tables
src/i18n.ts           every word on the page
src/config.ts         links, email, time zone
src/transition.ts     the letter-by-letter animation
src/cat.ts            the pixel cats, ported from the tracker
src/doodle.ts         hand-drawn icons
src/icons.ts          Lucide outlines and the GitHub mark
src/styles/           generated tokens, the cats' motion, the site's own styles, reading pages and the editor
src/dev/awkward.ts    development-only layout checks
og.html, src/og.ts    the link preview picture, as a page
scripts/              token, favicon and link-preview generators
public/               avatar, app icon, site icons and og.png
```

## Pictures

My avatar (`public/avatar.jpg` and the site icons made from it) and the tracker’s app icon (`public/icons/hrt.png`) are artwork, not code, and are not licensed for reuse with it. Oyama Mahiro is the protagonist of *Onii-chan wa Oshimai!* and belongs to her creators; the site only links to her.
