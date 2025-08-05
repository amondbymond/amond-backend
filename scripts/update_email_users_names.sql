-- Simple update for the most recent email user (likely test1@test1.com)
-- Since we can't decrypt emails in SQL, we'll update specific users

-- Update the most recent email user to have name 'test1' (assuming it's test1@test1.com)
UPDATE user 
SET name = 'test1'
WHERE id = 41 AND authType = '이메일';

-- If you know other specific user IDs and their emails, update them like this:
-- UPDATE user SET name = 'username' WHERE id = X AND authType = '이메일';

-- For future registrations, the code has been fixed to automatically 
-- extract the username from email during registration

-- Log the update
INSERT INTO migration_log (action, details, executed_at) 
VALUES ('update_email_user_names', 'Manually updated user names for email users', NOW());