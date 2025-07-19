-- Fix imageLog column size to handle longer error messages
ALTER TABLE content MODIFY COLUMN imageLog TEXT;

-- Update existing imageLog entries to clear any truncated data
UPDATE content SET imageLog = NULL WHERE imageLog IS NOT NULL; 