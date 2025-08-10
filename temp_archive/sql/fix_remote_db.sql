-- Fix REMOTE database to match structure
-- Generated on: 2025-08-10

-- ==============================
-- 1. Fix USER table
-- ==============================
-- Standardize name column to varchar(255)
ALTER TABLE user MODIFY COLUMN name VARCHAR(255);

-- ==============================
-- 2. Fix PROJECT table
-- ==============================
-- Change lastAccessedAt from timestamp to datetime
ALTER TABLE project MODIFY COLUMN lastAccessedAt DATETIME;

-- ==============================
-- 3. Ensure consistent NULL constraints
-- ==============================
-- brand table: fk_userId should allow NULL for flexibility
ALTER TABLE brand MODIFY COLUMN fk_userId INT NULL;

-- ==============================
-- 4. Add any missing indexes
-- ==============================
-- These use IF NOT EXISTS syntax not supported in older MySQL
-- So we'll check first
DELIMITER $$
CREATE PROCEDURE add_indexes_if_needed()
BEGIN
    -- Check and add index on user.grade
    IF NOT EXISTS (
        SELECT * FROM information_schema.statistics 
        WHERE table_schema = DATABASE() 
        AND table_name = 'user' 
        AND index_name = 'idx_grade'
    ) THEN
        ALTER TABLE user ADD INDEX idx_grade (grade);
    END IF;

    -- Check and add index on user.sessionToken
    IF NOT EXISTS (
        SELECT * FROM information_schema.statistics 
        WHERE table_schema = DATABASE() 
        AND table_name = 'user' 
        AND index_name = 'idx_sessionToken'
    ) THEN
        ALTER TABLE user ADD INDEX idx_sessionToken (sessionToken);
    END IF;
END$$
DELIMITER ;

CALL add_indexes_if_needed();
DROP PROCEDURE add_indexes_if_needed();