-- Add columns to content table for individual image configurations
ALTER TABLE content 
ADD COLUMN `snsEvent` BOOLEAN DEFAULT FALSE COMMENT 'SNS event flag',
ADD COLUMN `imageSize` VARCHAR(10) DEFAULT '1:1' COMMENT 'Image size ratio',
ADD COLUMN `additionalText` TEXT COMMENT 'Individual image additional instructions';