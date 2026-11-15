// The site's one script, for the sentence and the reading pages alike: it sets
// up whichever page is showing, then moves between them in place (router.ts).
import './styles/tokens.css';
import './styles/site.css';
import './styles/motion.css';

import { mountHome } from './home.ts';
import { mountReading } from './reading.ts';
import { startSite } from './router.ts';

startSite(() => (document.body.classList.contains('reading') ? mountReading : mountHome));
