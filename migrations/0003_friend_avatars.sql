-- A picture for each friend, shown beside their name. Either an address under
-- /media/ (uploaded from the editor) or empty, when the page draws their initial.

ALTER TABLE friends ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
