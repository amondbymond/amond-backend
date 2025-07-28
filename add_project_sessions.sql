-- Add session support to existing project table
ALTER TABLE project 
ADD COLUMN sessionName VARCHAR(255) AFTER name,
ADD COLUMN isActive BOOLEAN DEFAULT TRUE AFTER createdAt,
ADD COLUMN lastAccessedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER isActive;

-- Create index for faster session queries
CREATE INDEX idx_project_user_active ON project(fk_userId, isActive, lastAccessedAt);

-- Update existing projects to have session names
UPDATE project 
SET sessionName = CONCAT(name, ' - ', DATE_FORMAT(createdAt, '%Y-%m-%d'))
WHERE sessionName IS NULL;