-- Simple script to create or update an admin account
-- Default credentials:
-- Email: admin@amond.io.kr
-- Password: admin123!@#

-- First, check if user exists and update to admin
UPDATE user 
SET grade = 'A' 
WHERE email LIKE '%admin@amond.io.kr%' 
   OR emailDuplicate = SHA2('admin@amond.io.kr', 256);

-- If no rows were affected, you'll need to create the account
-- This is the bcrypt hash for 'admin123!@#' with salt rounds 10
-- Note: The email needs to be encrypted with your app's encryption key
INSERT INTO user (
  authType, 
  email, 
  password, 
  emailDuplicate, 
  name, 
  grade, 
  createdAt, 
  lastLoginAt
)
SELECT 
  '이메일',
  -- This is a placeholder - needs proper encryption
  'ENCRYPTED_EMAIL_HERE',
  -- BCrypt hash of 'admin123!@#'
  '$2b$10$5K5X7Kp7fHPzWyDvNWmjAeFG7pZHYzX8yd8QXxZjJGzJK8GTBmzPy',
  SHA2('admin@amond.io.kr', 256),
  '관리자',
  'A',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM user 
  WHERE emailDuplicate = SHA2('admin@amond.io.kr', 256)
);

-- Alternative: Promote your existing account to admin
-- 1. First, find your account:
-- SELECT id, email, name, grade FROM user WHERE email LIKE '%your-email%';

-- 2. Then update it to admin (replace YOUR_USER_ID with actual ID):
-- UPDATE user SET grade = 'A' WHERE id = YOUR_USER_ID;