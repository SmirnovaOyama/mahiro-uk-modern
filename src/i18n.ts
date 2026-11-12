// The page is one sentence that unfolds. Each node is a phrase shown folded
// (`label`) that opens into a longer phrase (`body`). Inside a body:
//   {>id}        another node, folded until someone opens it
//   {$name}      a live value: time, day, state; or a picture: catpic, avatar
//   {@key|text}  a link from config; with no text, the link's own address
//
// To add a language: add its code to `Lang` in types.ts, write another `Copy`
// below, list it in COPY and LOCALES, and put a switch back in the header.
import type { Lang } from './types.ts';

export interface Node {
    label: string;
    body: string;
}

export interface Copy {
    ui: {
        description: string;
        toDark: string;
        toLight: string;
        hint: string;
        done: string;
        leaveOut: string;
        leaveMine: string;
        go: string;
        stay: string;
    };
    root: string;
    nodes: Record<string, Node>;
    states: Record<string, string>;
}

const en: Copy = {
    ui: {
        description: 'Smirnova Anya builds quiet, deliberate software in the open.',
        toDark: 'Switch to the dark theme',
        toLight: 'Switch to the light theme',
        hint: 'Tap any dotted phrase to unfold it',
        done: 'Nothing left',
        leaveOut: 'This leads to {host}, outside of *.{domain}.',
        leaveMine: 'This opens {host}.',
        go: 'Take me there',
        stay: 'Stay here',
    },
    root: '{$avatar} Hello, and welcome. I’m {>name}. I build {>things}. I am unreservedly devoted to {>mahiro}, and I read {>write}.',
    nodes: {
        name: { label: 'Anya', body: 'Smirnova Anya (寻寻), writing from {>where}' },
        where: { label: 'UTC+8', body: 'UTC+8, where it is {$time} on {$day} and {>cat} is {$state}' },
        cat: { label: 'the cat', body: 'the cat {$catpic}' },
        things: { label: 'quiet software', body: 'quiet, deliberate software, {>open}: {>hrt}, {>parley} and {>dsh}' },
        open: { label: 'always in the open', body: 'always in the open on {@github|GitHub}' },
        hrt: {
            label: 'a hormone tracker',
            body: '{@hrt|Oyama’s HRT Tracker} (a private pharmacokinetic model that turns a log of HRT doses into estimated hormone levels)',
        },
        parley: {
            label: 'a chat service',
            body: '{@parley|Parley} (a self-hosted AI chat service for teams, classrooms and households, whose API keys never reach the browser)',
        },
        dsh: {
            label: 'a coding agent',
            body: '{@dsh|DeepSeek Harness} (a desktop coding agent that asks permission before it touches a single file)',
        },
        mahiro: { label: 'a certain anime girl', body: '{@mahiro|Oyama Mahiro}, of Onimai fame' },
        write: { label: 'every letter', body: 'every letter that arrives at {@email}' },
    },
    states: {
        waking: 'only half awake',
        alert: 'alarmingly alert',
        playing: 'batting at a ball of wool',
        napping: 'deep in its midday nap',
        grooming: 'grooming with great seriousness',
        waiting: 'staring pointedly at an empty bowl',
        eating: 'at dinner',
        winding: 'losing a slow battle with sleep',
        asleep: 'fast asleep',
    },
};

const COPY: Record<Lang, Copy> = { en };
const LOCALES: Record<Lang, string> = { en: 'en-GB' };
const lang: Lang = 'en';

export const copy = (): Copy => COPY[lang];
/** The locale to hand to Intl for the current language. */
export const locale = (): string => LOCALES[lang];
