-- Update existing users without names based on their email or authType
-- This will fix the sidebar display issue

-- Update email users: extract name from email
UPDATE user 
SET name = SUBSTRING_INDEX(
    SUBSTRING_INDEX(email, '@', 1), 
    '/', 
    -1
)
WHERE authType = '이메일' 
AND (name IS NULL OR name LIKE '사용자_%');

-- For social login users without proper names
UPDATE user 
SET name = CASE 
    WHEN authType = '구글' THEN '구글 사용자'
    WHEN authType = '카카오' THEN '카카오 사용자'
    ELSE CONCAT(authType, ' 사용자')
END
WHERE (name IS NULL OR name LIKE '사용자_%')
AND authType IN ('구글', '카카오');

-- Log the update
INSERT INTO migration_log (action, details, executed_at) 
VALUES ('update_user_names', 'Updated user names for better display in sidebar', NOW());