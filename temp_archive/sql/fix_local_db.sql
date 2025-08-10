-- Fix LOCAL database to match structure
-- Generated on: 2025-08-10

-- ==============================
-- 1. Fix BRAND table - Add missing columns
-- ==============================
DELIMITER $$
CREATE PROCEDURE add_brand_columns_local()
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

CALL add_brand_columns_local();
DROP PROCEDURE add_brand_columns_local;