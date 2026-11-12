// Draws the link preview picture: the folded sentence as a visitor first sees
// it, at 1200 × 630. `npm run og` photographs this page into public/og.png.
import './styles/tokens.css';
import './styles/cat.css';
import './styles/og.css';

import { drawCat } from './cat.ts';
import { doodle } from './doodle.ts';

// The cat lies still, curled up and asleep, rather than mid-flick in a photo.
drawCat(document.getElementById('cat') as unknown as SVGSVGElement, { pose: 'donut', state: 'napping' });
document.getElementById('tap')!.innerHTML = doodle('tap');
document.documentElement.dataset.ready = 'true';
