-- Comprehensive Migration Script for Production Database
-- Run this script on production to sync with local schema
-- Generated after comparing local_schemas.sql and production_schemas.sql

-- 1. Brand table updates
-- Production is missing 8 columns that exist in local
ALTER TABLE brand 
ADD COLUMN IF NOT EXISTS `advantages` TEXT COMMENT 'Company advantages',
ADD COLUMN IF NOT EXISTS `coreProduct` VARCHAR(500) COMMENT 'Core product/service',
ADD COLUMN IF NOT EXISTS `coreProductDetail` TEXT COMMENT 'Core product detailed description',
ADD COLUMN IF NOT EXISTS `targetAudience` VARCHAR(500) COMMENT 'Target audience',
ADD COLUMN IF NOT EXISTS `targetAudienceDetail` TEXT COMMENT 'Target audience detailed description',
ADD COLUMN IF NOT EXISTS `mainColor` VARCHAR(50) COMMENT 'Main theme color for content',
ADD COLUMN IF NOT EXISTS `selectedContentTypes` JSON COMMENT 'Selected content types for this brand',
ADD COLUMN IF NOT EXISTS `brandAnalysis` TEXT COMMENT 'AI-generated brand analysis summary';

-- 2. Content table updates
-- Add missing columns
ALTER TABLE content
ADD COLUMN IF NOT EXISTS `snsEvent` TINYINT(1) DEFAULT 0 COMMENT 'SNS event flag',
ADD COLUMN IF NOT EXISTS `imageSize` VARCHAR(10) DEFAULT '1:1' COMMENT 'Image size ratio',
ADD COLUMN IF NOT EXISTS `additionalText` TEXT COMMENT 'Individual image additional instructions';

-- Change imageLog from varchar(15) to text to match local
ALTER TABLE content MODIFY COLUMN `imageLog` TEXT;

-- 3. ContentRequest table updates
-- Add missing mainColor column
ALTER TABLE contentRequest
ADD COLUMN IF NOT EXISTS `mainColor` VARCHAR(100) DEFAULT NULL;

-- Expand directionList from varchar(25) to varchar(500) to match local
ALTER TABLE contentRequest MODIFY COLUMN `directionList` VARCHAR(500) DEFAULT NULL;

-- Note: Production has 'status' column that local doesn't have - keeping it as it may be used

-- 4. Project table updates
-- Change lastAccessedAt from timestamp to datetime to match local
ALTER TABLE project MODIFY COLUMN `lastAccessedAt` DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 5. User table updates (sessionToken columns already exist in production)
-- Just ensure the index exists
ALTER TABLE user ADD INDEX IF NOT EXISTS `idx_sessionToken` (`sessionToken`);

-- 6. EmailNotification table updates
-- Add missing foreign key constraints and indexes to match local
ALTER TABLE emailNotification
MODIFY COLUMN `fk_userId` INT NOT NULL,
MODIFY COLUMN `fk_contentRequestId` INT NOT NULL,
MODIFY COLUMN `createdAt` DATETIME NOT NULL;

-- Add indexes if not exist
ALTER TABLE emailNotification ADD INDEX IF NOT EXISTS `idx_status_contentRequestId` (`status`, `fk_contentRequestId`);
ALTER TABLE emailNotification ADD INDEX IF NOT EXISTS `fk_userId` (`fk_userId`);
ALTER TABLE emailNotification ADD INDEX IF NOT EXISTS `fk_contentRequestId` (`fk_contentRequestId`);
ALTER TABLE emailNotification ADD INDEX IF NOT EXISTS `idx_pending_notifications` (`fk_contentRequestId`, `status`);

-- Add foreign key constraints if not exist
ALTER TABLE emailNotification 
ADD CONSTRAINT IF NOT EXISTS `emailNotification_ibfk_1` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE,
ADD CONSTRAINT IF NOT EXISTS `emailNotification_ibfk_2` FOREIGN KEY (`fk_contentRequestId`) REFERENCES `contentRequest` (`id`) ON DELETE CASCADE;

-- 7. Create cleanup_log table (exists in local but not production)
-- This is optional as it may not be critical for production
CREATE TABLE IF NOT EXISTS `cleanup_log` (
  `action` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `count` int DEFAULT NULL,
  `executed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Log migration completion
INSERT INTO migration_log (action, details, executed_at) 
VALUES ('comprehensive_migration.sql', 'Synced schema differences between local and production', NOW());