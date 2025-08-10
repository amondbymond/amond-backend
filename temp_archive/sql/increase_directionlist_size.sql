-- Increase directionList column size to store JSON arrays
ALTER TABLE contentRequest 
MODIFY COLUMN directionList VARCHAR(500);