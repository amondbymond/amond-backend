-- Update membership_tiers to match new pricing structure
-- Note: We'll use existing columns but reinterpret their meaning

-- First, add new columns for single image limits if they don't exist
ALTER TABLE membership_tiers 
ADD COLUMN IF NOT EXISTS single_image_limit INT DEFAULT 0 COMMENT 'Total single images allowed',
ADD COLUMN IF NOT EXISTS daily_edit_limit INT DEFAULT NULL COMMENT 'Daily edit limit (NULL = unlimited)';

-- Update the existing tiers with new limits
UPDATE membership_tiers SET
  monthly_grid_sets = 1,        -- Total projects (not monthly)
  single_image_limit = 1,       -- 1 single image
  content_edit_limit = 0,       -- No edits (total)
  daily_edit_limit = 0          -- No daily edits
WHERE tier_name = 'basic';

UPDATE membership_tiers SET
  monthly_grid_sets = 4,        -- 4 projects total
  single_image_limit = 20,      -- 5 per project x 4
  content_edit_limit = -1,      -- Unlimited total (controlled by daily)
  daily_edit_limit = 5          -- 5 edits per day
WHERE tier_name = 'pro';

UPDATE membership_tiers SET  
  monthly_grid_sets = 10,       -- 10 projects max
  single_image_limit = 100,     -- 10 per project x 10
  content_edit_limit = -1,      -- Unlimited
  daily_edit_limit = NULL       -- Unlimited daily
WHERE tier_name = 'business';

-- Create usage_tracking table to track actual usage
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

-- Add tracking columns to project table
ALTER TABLE project 
ADD COLUMN IF NOT EXISTS is_free_initial BOOLEAN DEFAULT FALSE COMMENT 'Is this the free initial 4-grid set';

-- Add tracking column to content table  
ALTER TABLE content 
ADD COLUMN IF NOT EXISTS is_single_image BOOLEAN DEFAULT FALSE COMMENT 'Is this a single generated image';

-- Create view for easy usage checking
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