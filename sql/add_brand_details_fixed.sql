-- Add missing columns to brand table
ALTER TABLE brand 
ADD COLUMN `advantages` TEXT COMMENT 'Company advantages',
ADD COLUMN `coreProduct` VARCHAR(500) COMMENT 'Core product/service name',
ADD COLUMN `targetAudience` VARCHAR(500) COMMENT 'Target audience',
ADD COLUMN `mainColor` VARCHAR(50) COMMENT 'Main theme color',
ADD COLUMN `selectedContentTypes` JSON COMMENT 'Selected content types for generation';