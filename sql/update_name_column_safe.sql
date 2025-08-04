-- Safe script to add name column if it doesn't exist
-- This script checks if the column exists before trying to add it

-- Create stored procedure to safely add column
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS AddNameColumnIfNotExists()
BEGIN
    IF NOT EXISTS (
        SELECT * 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'user' 
        AND COLUMN_NAME = 'name' 
        AND TABLE_SCHEMA = DATABASE()
    ) THEN
        ALTER TABLE user ADD COLUMN name VARCHAR(100) DEFAULT NULL AFTER authType;
    END IF;
END$$
DELIMITER ;

-- Call the procedure
CALL AddNameColumnIfNotExists();

-- Drop the procedure
DROP PROCEDURE IF EXISTS AddNameColumnIfNotExists;

-- Update existing users with default names
UPDATE user 
SET name = CASE 
    WHEN authType = '카카오' THEN '카카오 사용자'
    WHEN authType = '구글' THEN '구글 사용자'
    WHEN authType = '이메일' AND id = 27 THEN 'test1'  -- Specific name for user 27
    ELSE CONCAT('user_', id)
END
WHERE name IS NULL OR name = '';

-- Show sample results
SELECT id, authType, name, email FROM user LIMIT 10;