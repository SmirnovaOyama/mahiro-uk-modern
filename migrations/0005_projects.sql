-- What I make, in the order the projects page shows it. Each is led on the page
-- by its rule (the one thing it will not do, or always does), then its name and
-- a line about it, then its links: a GitHub or GitLab repository, a website.
-- `links` is a JSON list of { url, preview }; the Worker fills in each preview
-- (worker/previews.ts) when the list is saved, and refreshes it now and then.

CREATE TABLE projects (
    position INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    rule TEXT NOT NULL DEFAULT '',
    about TEXT NOT NULL DEFAULT '',
    links TEXT NOT NULL DEFAULT '[]'
);

INSERT INTO projects (position, name, rule, about, links) VALUES
    (0, 'Oyama’s HRT Tracker', 'The dose log stays private.', 'A pharmacokinetic model that turns a log of HRT doses into estimated hormone levels.', '[{"url":"https://hrt.mahiro.uk","preview":null}]'),
    (1, 'Parley', 'API keys never reach the browser.', 'A self-hosted AI chat service for teams, classrooms and households.', '[{"url":"https://github.com/SmirnovaOyama/parley","preview":null}]'),
    (2, 'DeepSeek Harness', 'It asks before it touches a single file.', 'A desktop coding agent, built to be supervised rather than trusted.', '[{"url":"https://github.com/SmirnovaOyama/dsh","preview":null}]');
