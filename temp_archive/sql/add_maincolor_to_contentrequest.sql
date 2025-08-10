-- Add mainColor column to contentRequest table
ALTER TABLE contentRequest 
ADD COLUMN mainColor VARCHAR(100) AFTER directionList;