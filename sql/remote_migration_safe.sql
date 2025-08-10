-- Safe migration script for remote database
-- This version checks for existence before adding columns

-- ==============================
-- 1. Update membership_tiers table
-- ==============================

-- Drop and recreate procedure for safe column addition
DROP PROCEDURE IF EXISTS add_column_if_not_exists;

DELIMITER $$
CREATE PROCEDURE add_column_if_not_exists()
BEGIN
    -- Check and add single_image_limit to membership_tiers
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'membership_tiers' 
        AND column_name = 'single_image_limit'
    ) THEN
        ALTER TABLE membership_tiers 
        ADD COLUMN single_image_limit INT DEFAULT 0 COMMENT 'Total single images allowed';
    END IF;

    -- Check and add daily_edit_limit to membership_tiers
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'membership_tiers' 
        AND column_name = 'daily_edit_limit'
    ) THEN
        ALTER TABLE membership_tiers 
        ADD COLUMN daily_edit_limit INT DEFAULT NULL COMMENT 'Daily edit limit (NULL = unlimited)';
    END IF;

    -- Check and add is_free_initial to project
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'project' 
        AND column_name = 'is_free_initial'
    ) THEN
        ALTER TABLE project 
        ADD COLUMN is_free_initial BOOLEAN DEFAULT FALSE COMMENT 'Is this the free initial 4-grid set';
    END IF;

    -- Check and add is_single_image to content
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'content' 
        AND column_name = 'is_single_image'
    ) THEN
        ALTER TABLE content 
        ADD COLUMN is_single_image BOOLEAN DEFAULT FALSE COMMENT 'Is this a single generated image';
    END IF;
END$$
DELIMITER ;

-- Call the procedure
CALL add_column_if_not_exists();

-- Drop the procedure
DROP PROCEDURE add_column_if_not_exists;

-- Update the existing tiers with new limits
UPDATE membership_tiers SET
  single_image_limit = 1,
  daily_edit_limit = 0
WHERE tier_name = 'basic' OR tier_name = 'c' OR tier_name = 'C';

UPDATE membership_tiers SET
  single_image_limit = 20,
  daily_edit_limit = 5
WHERE tier_name = 'pro';

UPDATE membership_tiers SET  
  single_image_limit = 100,
  daily_edit_limit = NULL
WHERE tier_name = 'business';

UPDATE membership_tiers SET  
  single_image_limit = 0,
  daily_edit_limit = NULL
WHERE tier_name = 'premium';

-- Update monthly_grid_sets to match new pricing
UPDATE membership_tiers SET monthly_grid_sets = 1 WHERE tier_name = 'basic' OR tier_name = 'c' OR tier_name = 'C';
UPDATE membership_tiers SET monthly_grid_sets = 4 WHERE tier_name = 'pro';
UPDATE membership_tiers SET monthly_grid_sets = 10 WHERE tier_name = 'business';

-- ==============================
-- 2. Create usage_tracking table
-- ==============================
CREATE TABLE IF NOT EXISTS usage_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fk_userId INT NOT NULL,
  usage_type ENUM('project_creation', 'single_image_creation', 'content_edit') NOT NULL,
  fk_projectId INT,
  fk_contentId INT,
  fk_brandId INT,
  usage_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fk_userId) REFERENCES user(id),
  FOREIGN KEY (fk_projectId) REFERENCES project(id),
  FOREIGN KEY (fk_contentId) REFERENCES content(id),
  FOREIGN KEY (fk_brandId) REFERENCES brand(id),
  INDEX idx_user_date (fk_userId, usage_date),
  INDEX idx_user_type_date (fk_userId, usage_type, usage_date)
);

-- ==============================
-- 3. Create cleanup_log table
-- ==============================
CREATE TABLE IF NOT EXISTS cleanup_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cleanup_type VARCHAR(50) NOT NULL,
  items_cleaned INT DEFAULT 0,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cleanup_type (cleanup_type),
  INDEX idx_created_at (created_at)
);

-- ==============================
-- 4. Create user_usage_summary view
-- ==============================
CREATE OR REPLACE VIEW user_usage_summary AS
SELECT 
  u.id as user_id,
  u.name,
  u.grade,
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'project_creation' THEN ut.id END) as total_projects_created,
  mt.monthly_grid_sets as project_limit,
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'single_image_creation' THEN ut.id END) as total_single_images,
  mt.single_image_limit,
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'content_edit' AND ut.usage_date = CURRENT_DATE THEN ut.id END) as edits_today,
  mt.daily_edit_limit,
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'content_edit' THEN ut.id END) as total_edits,
  mt.content_edit_limit as total_edit_limit
FROM user u
LEFT JOIN membership_tiers mt ON u.grade COLLATE utf8mb4_unicode_ci = mt.tier_name COLLATE utf8mb4_unicode_ci
LEFT JOIN usage_tracking ut ON u.id = ut.fk_userId
GROUP BY u.id, u.name, u.grade, mt.monthly_grid_sets, mt.single_image_limit, 
         mt.daily_edit_limit, mt.content_edit_limit;

-- ==============================
-- 5. Log migration completion
-- ==============================
-- First check if migration_log has the columns we need
CREATE TABLE IF NOT EXISTS migration_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  migration_name VARCHAR(255) UNIQUE,
  status VARCHAR(50),
  executed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO migration_status (migration_name, status, executed_at) 
VALUES ('remote_migration_usage_tracking_2025_08_10', 'completed', NOW())
ON DUPLICATE KEY UPDATE 
  status = 'completed', 
  executed_at = NOW();