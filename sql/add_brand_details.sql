-- Add new columns to brand table for detailed information
ALTER TABLE brand 
ADD COLUMN IF NOT EXISTS `advantages` TEXT COMMENT 'Company advantages',
ADD COLUMN IF NOT EXISTS `coreProduct` VARCHAR(500) COMMENT 'Core product/service',
ADD COLUMN IF NOT EXISTS `coreProductDetail` TEXT COMMENT 'Core product detailed description',
ADD COLUMN IF NOT EXISTS `targetAudience` VARCHAR(500) COMMENT 'Target audience',
ADD COLUMN IF NOT EXISTS `targetAudienceDetail` TEXT COMMENT 'Target audience detailed description',
ADD COLUMN IF NOT EXISTS `mainColor` VARCHAR(50) COMMENT 'Main theme color for content',
ADD COLUMN IF NOT EXISTS `selectedContentTypes` JSON COMMENT 'Selected content types for this brand';

-- Add column for storing AI-generated brand analysis
ALTER TABLE brand
ADD COLUMN IF NOT EXISTS `brandAnalysis` TEXT COMMENT 'AI-generated brand analysis summary';