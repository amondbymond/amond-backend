-- Fix brand table column size mismatches
-- This prevents errors when users enter longer values

ALTER TABLE brand 
MODIFY COLUMN `name` VARCHAR(255) NOT NULL,
MODIFY COLUMN `category` VARCHAR(255) DEFAULT NULL,
MODIFY COLUMN `url` VARCHAR(512) DEFAULT NULL;

-- Log the change
INSERT INTO migration_log (action, details, executed_at) 
VALUES ('fix_brand_column_sizes', 'Expanded name, category, and url column sizes to match local schema', NOW());