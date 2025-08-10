-- Migration script to update remote database to match local structure
-- Generated on: 2025-08-10

-- ==============================
-- 1. Add missing columns to membership_tiers
-- ==============================
ALTER TABLE membership_tiers 
ADD COLUMN IF NOT EXISTS single_image_limit INT DEFAULT 0 COMMENT 'Total single images allowed',
ADD COLUMN IF NOT EXISTS daily_edit_limit INT DEFAULT NULL COMMENT 'Daily edit limit (NULL = unlimited)';

-- Update the existing tiers with new limits
UPDATE membership_tiers SET
  single_image_limit = 1,       -- 1 single image for basic
  daily_edit_limit = 0          -- No daily edits for basic
WHERE tier_name = 'basic';

UPDATE membership_tiers SET
  single_image_limit = 20,      -- 20 single images for pro
  daily_edit_limit = 5          -- 5 edits per day for pro
WHERE tier_name = 'pro';

UPDATE membership_tiers SET  
  single_image_limit = 100,     -- 100 single images for business
  daily_edit_limit = NULL       -- Unlimited daily for business
WHERE tier_name = 'business';

UPDATE membership_tiers SET  
  single_image_limit = 0,       -- Premium doesn't have this feature yet
  daily_edit_limit = NULL       -- Unlimited daily for premium
WHERE tier_name = 'premium';

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
-- 4. Add missing columns to project table
-- ==============================
ALTER TABLE project 
ADD COLUMN IF NOT EXISTS is_free_initial BOOLEAN DEFAULT FALSE COMMENT 'Is this the free initial 4-grid set';

-- ==============================
-- 5. Add missing columns to content table
-- ==============================
ALTER TABLE content 
ADD COLUMN IF NOT EXISTS is_single_image BOOLEAN DEFAULT FALSE COMMENT 'Is this a single generated image';

-- ==============================
-- 6. Create user_usage_summary view
-- ==============================
CREATE OR REPLACE VIEW user_usage_summary AS
SELECT 
  u.id as user_id,
  u.name,
  u.grade,
  -- Project usage
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'project_creation' THEN ut.id END) as total_projects_created,
  mt.monthly_grid_sets as project_limit,
  -- Single image usage  
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'single_image_creation' THEN ut.id END) as total_single_images,
  mt.single_image_limit,
  -- Edit usage (today)
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'content_edit' AND ut.usage_date = CURRENT_DATE THEN ut.id END) as edits_today,
  mt.daily_edit_limit,
  -- Edit usage (total)
  COUNT(DISTINCT CASE WHEN ut.usage_type = 'content_edit' THEN ut.id END) as total_edits,
  mt.content_edit_limit as total_edit_limit
FROM user u
LEFT JOIN membership_tiers mt ON u.grade COLLATE utf8mb4_unicode_ci = mt.tier_name COLLATE utf8mb4_unicode_ci
LEFT JOIN usage_tracking ut ON u.id = ut.fk_userId
GROUP BY u.id, u.name, u.grade, mt.monthly_grid_sets, mt.single_image_limit, 
         mt.daily_edit_limit, mt.content_edit_limit;

-- ==============================
-- 7. Update existing data for consistency
-- ==============================
-- Update monthly_grid_sets to match new pricing structure
UPDATE membership_tiers SET monthly_grid_sets = 1 WHERE tier_name = 'basic' OR tier_name = 'c' OR tier_name = 'C';
UPDATE membership_tiers SET monthly_grid_sets = 4 WHERE tier_name = 'pro';
UPDATE membership_tiers SET monthly_grid_sets = 10 WHERE tier_name = 'business';

-- ==============================
-- 8. Log migration completion
-- ==============================
INSERT INTO migration_log (migration_name, status, executed_at) 
VALUES ('remote_migration_usage_tracking_2025_08_10', 'completed', NOW())
ON DUPLICATE KEY UPDATE 
  status = 'completed', 
  executed_at = NOW();