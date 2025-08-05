-- Production-Compatible Migration Script
-- Works with older MySQL versions that don't support IF NOT EXISTS for columns

-- 1. Brand table updates
-- Check and add each column individually
ALTER TABLE brand ADD COLUMN `advantages` TEXT COMMENT 'Company advantages';
ALTER TABLE brand ADD COLUMN `coreProduct` VARCHAR(500) COMMENT 'Core product/service';
ALTER TABLE brand ADD COLUMN `coreProductDetail` TEXT COMMENT 'Core product detailed description';
ALTER TABLE brand ADD COLUMN `targetAudience` VARCHAR(500) COMMENT 'Target audience';
ALTER TABLE brand ADD COLUMN `targetAudienceDetail` TEXT COMMENT 'Target audience detailed description';
ALTER TABLE brand ADD COLUMN `mainColor` VARCHAR(50) COMMENT 'Main theme color for content';
ALTER TABLE brand ADD COLUMN `selectedContentTypes` JSON COMMENT 'Selected content types for this brand';
ALTER TABLE brand ADD COLUMN `brandAnalysis` TEXT COMMENT 'AI-generated brand analysis summary';

-- 2. Content table updates
ALTER TABLE content ADD COLUMN `snsEvent` TINYINT(1) DEFAULT 0 COMMENT 'SNS event flag';
ALTER TABLE content ADD COLUMN `imageSize` VARCHAR(10) DEFAULT '1:1' COMMENT 'Image size ratio';
ALTER TABLE content ADD COLUMN `additionalText` TEXT COMMENT 'Individual image additional instructions';

-- Change imageLog from varchar(15) to text
ALTER TABLE content MODIFY COLUMN `imageLog` TEXT;

-- 3. ContentRequest table updates
ALTER TABLE contentRequest ADD COLUMN `mainColor` VARCHAR(100) DEFAULT NULL;

-- Expand directionList
ALTER TABLE contentRequest MODIFY COLUMN `directionList` VARCHAR(500) DEFAULT NULL;

-- 4. Project table updates
ALTER TABLE project MODIFY COLUMN `lastAccessedAt` DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 5. EmailNotification indexes
ALTER TABLE emailNotification ADD INDEX `idx_status_contentRequestId` (`status`, `fk_contentRequestId`);
ALTER TABLE emailNotification ADD INDEX `fk_userId` (`fk_userId`);
ALTER TABLE emailNotification ADD INDEX `fk_contentRequestId` (`fk_contentRequestId`);
ALTER TABLE emailNotification ADD INDEX `idx_pending_notifications` (`fk_contentRequestId`, `status`);

-- 6. Log migration
INSERT INTO migration_log (action, details, executed_at) 
VALUES ('production_migration_compatible.sql', 'Added missing columns to brand, content, and contentRequest tables', NOW());