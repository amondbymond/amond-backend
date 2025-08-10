-- Safe Migration Script with error handling
-- Run each statement individually to identify any issues

-- 1. Brand table - Add missing columns one by one
-- These are the columns causing the error "Unknown column 'advantages'"
ALTER TABLE brand ADD COLUMN `advantages` TEXT COMMENT 'Company advantages';
ALTER TABLE brand ADD COLUMN `coreProduct` VARCHAR(500) COMMENT 'Core product/service';
ALTER TABLE brand ADD COLUMN `coreProductDetail` TEXT COMMENT 'Core product detailed description';
ALTER TABLE brand ADD COLUMN `targetAudience` VARCHAR(500) COMMENT 'Target audience';
ALTER TABLE brand ADD COLUMN `targetAudienceDetail` TEXT COMMENT 'Target audience detailed description';
ALTER TABLE brand ADD COLUMN `mainColor` VARCHAR(50) COMMENT 'Main theme color for content';
ALTER TABLE brand ADD COLUMN `selectedContentTypes` JSON COMMENT 'Selected content types for this brand';
ALTER TABLE brand ADD COLUMN `brandAnalysis` TEXT COMMENT 'AI-generated brand analysis summary';