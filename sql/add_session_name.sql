-- Add sessionName column to project table
ALTER TABLE project 
ADD COLUMN sessionName VARCHAR(255) DEFAULT NULL AFTER name;

-- Also add lastAccessedAt and isActive if they don't exist
ALTER TABLE project 
ADD COLUMN lastAccessedAt DATETIME DEFAULT NULL,
ADD COLUMN isActive BOOLEAN DEFAULT TRUE;