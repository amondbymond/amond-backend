-- Add direction field to content table if it doesn't exist
ALTER TABLE content ADD COLUMN IF NOT EXISTS direction VARCHAR(50) DEFAULT '정보형';

-- Update existing content items to have a default direction if they don't have one
UPDATE content SET direction = '정보형' WHERE direction IS NULL; 