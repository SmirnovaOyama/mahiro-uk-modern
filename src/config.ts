import type { ProjectKey } from './types.ts';

export interface Project {
    key: ProjectKey;
    href: string;
}

const projects: Project[] = [
    { key: 'hrt', href: 'https://hrt.mahiro.uk' },
    { key: 'parley', href: 'https://github.com/SmirnovaOyama/parley' },
    { key: 'dsh', href: 'https://github.com/SmirnovaOyama/dsh' },
];

/** Everything about the person the page is for. Names and blurbs live in i18n.ts. */
const config = {
    /** The clock the cat keeps. */
    utcOffsetHours: 8,
    email: 'contact@mahiro.uk',
    github: 'https://github.com/SmirnovaOyama',
    mahiro: 'https://oniichan-wa-oshimai.fandom.com/wiki/Mahiro_Oyama',
    projects,
};

export default config;
