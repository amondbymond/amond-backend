-- Simple fix for REMOTE database
-- Split into individual statements to isolate the error

-- 1. Fix user table
ALTER TABLE user MODIFY COLUMN name VARCHAR(255);

-- 2. Fix project table  
ALTER TABLE project MODIFY COLUMN lastAccessedAt DATETIME;

-- 3. Fix brand table
ALTER TABLE brand MODIFY COLUMN fk_userId INT NULL;

-- 4. Add indexes using CREATE INDEX instead of ALTER TABLE
-- First drop if exists (ignore errors)
DROP INDEX idx_grade ON user;
DROP INDEX idx_sessionToken ON user;

-- Then create
CREATE INDEX idx_grade ON user (grade);
CREATE INDEX idx_sessionToken ON user (sessionToken);