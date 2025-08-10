-- Migration script to fix discrepancies between local and remote databases
-- Generated on: 2025-08-10

-- ==============================
-- 1. Fix USER table discrepancies
-- ==============================
-- Remote has name as varchar(255), local has varchar(100)
-- Let's standardize to varchar(255) for safety
ALTER TABLE user MODIFY COLUMN name VARCHAR(255);

-- ==============================
-- 2. Fix PROJECT table discrepancies
-- ==============================
-- Remote has lastAccessedAt as timestamp with default, local has datetime
-- Let's standardize to datetime to match local
ALTER TABLE project MODIFY COLUMN lastAccessedAt DATETIME;

-- Ensure column order matches (move isActive before lastAccessedAt)
-- First drop and re-add in correct position
ALTER TABLE project MODIFY COLUMN isActive TINYINT(1) DEFAULT 1 AFTER fk_brandId;

-- ==============================
-- 3. Fix BRAND table discrepancies
-- ==============================
-- Remote has additional columns that local doesn't have
-- Add missing columns to local
DELIMITER $$
CREATE PROCEDURE add_brand_columns()
BEGIN
    -- Add coreProductDetail if it doesn't exist
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'brand' 
        AND column_name = 'coreProductDetail'
    ) THEN
        ALTER TABLE brand 
        ADD COLUMN coreProductDetail TEXT AFTER coreProduct;
    END IF;

    -- Add targetAudienceDetail if it doesn't exist
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'brand' 
        AND column_name = 'targetAudienceDetail'
    ) THEN
        ALTER TABLE brand 
        ADD COLUMN targetAudienceDetail TEXT AFTER targetAudience;
    END IF;

    -- Add brandAnalysis if it doesn't exist
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'brand' 
        AND column_name = 'brandAnalysis'
    ) THEN
        ALTER TABLE brand 
        ADD COLUMN brandAnalysis TEXT AFTER selectedContentTypes;
    END IF;
END$$
DELIMITER ;

CALL add_brand_columns();
DROP PROCEDURE add_brand_columns;

-- Fix fk_userId nullability (remote has NOT NULL, local has NULL)
-- Keep it as NULL to be safe (less restrictive)
UPDATE brand SET fk_userId = 1 WHERE fk_userId IS NULL; -- Set a default user ID if any are NULL
ALTER TABLE brand MODIFY COLUMN fk_userId INT NOT NULL;

-- Fix createdAt and updatedAt nullability (remote allows NULL, local doesn't)
-- Keep as NOT NULL to be stricter
ALTER TABLE brand MODIFY COLUMN createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE brand MODIFY COLUMN updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ==============================
-- 4. Verify and fix indexes
-- ==============================
-- Ensure all foreign key indexes exist
-- These should already exist but let's make sure
ALTER TABLE user ADD INDEX IF NOT EXISTS idx_grade (grade);
ALTER TABLE user ADD INDEX IF NOT EXISTS idx_sessionToken (sessionToken);
ALTER TABLE project ADD INDEX IF NOT EXISTS idx_userId (fk_userId);
ALTER TABLE project ADD INDEX IF NOT EXISTS idx_brandId (fk_brandId);
ALTER TABLE brand ADD INDEX IF NOT EXISTS idx_userId (fk_userId);

-- ==============================
-- 5. Log the fixes
-- ==============================
INSERT INTO migration_status (migration_name, status, executed_at) 
VALUES ('fix_discrepancies_2025_08_10', 'completed', NOW())
ON DUPLICATE KEY UPDATE 
  status = 'completed', 
  executed_at = NOW();