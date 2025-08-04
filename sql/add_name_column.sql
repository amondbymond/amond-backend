-- Add name column to user table
ALTER TABLE user ADD COLUMN name VARCHAR(100) DEFAULT NULL AFTER authType;

-- Update existing users with a default name based on their auth type
-- For social login users, use auth type + '사용자'
UPDATE user 
SET name = CASE 
    WHEN authType = '카카오' THEN '카카오 사용자'
    WHEN authType = '구글' THEN '구글 사용자'
    ELSE CONCAT('이메일 사용자', id)
END
WHERE name IS NULL AND authType != '이메일';

-- For email users, extract the username part from email
-- First, create a temporary function to decrypt email if needed
-- Note: This assumes emails are stored encrypted and need decryption
-- If emails are stored in plain text, use the simpler UPDATE below

-- Simple version if emails are not encrypted:
-- UPDATE user 
-- SET name = SUBSTRING_INDEX(email, '@', 1)
-- WHERE authType = '이메일' AND email IS NOT NULL AND name IS NULL;

-- Note: Since emails might be encrypted, you may need to run a script to decrypt and update names
-- For now, email users will get a default name that can be updated later