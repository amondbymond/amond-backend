-- Add session token columns to user table for incognito mode support
ALTER TABLE user 
ADD COLUMN sessionToken VARCHAR(255) DEFAULT NULL,
ADD COLUMN tokenUpdatedAt DATETIME DEFAULT NULL;

-- Create index for faster token lookups
CREATE INDEX idx_user_session_token ON user(sessionToken);