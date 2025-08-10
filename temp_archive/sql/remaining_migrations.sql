-- Remaining migrations for content and contentRequest tables

-- 2. Content table updates
ALTER TABLE content ADD COLUMN `snsEvent` TINYINT(1) DEFAULT 0 COMMENT 'SNS event flag';
ALTER TABLE content ADD COLUMN `imageSize` VARCHAR(10) DEFAULT '1:1' COMMENT 'Image size ratio';
ALTER TABLE content ADD COLUMN `additionalText` TEXT COMMENT 'Individual image additional instructions';

-- Change imageLog from varchar(15) to text
ALTER TABLE content MODIFY COLUMN `imageLog` TEXT;

-- 3. ContentRequest table updates
ALTER TABLE contentRequest ADD COLUMN `mainColor` VARCHAR(100) DEFAULT NULL;

-- Expand directionList column size
ALTER TABLE contentRequest MODIFY COLUMN `directionList` VARCHAR(500) DEFAULT NULL;

-- 4. Log successful migration
INSERT INTO migration_log (action, details, executed_at) 
VALUES ('schema_sync_migration', 'Synced brand, content, and contentRequest tables with local schema', NOW());