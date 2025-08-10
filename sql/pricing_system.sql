-- Create user_subscription table to track user's subscription level
CREATE TABLE IF NOT EXISTS user_subscription (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fk_userId INT NOT NULL,
  subscription_type ENUM('basic', 'professional', 'business') NOT NULL DEFAULT 'basic',
  start_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_date DATETIME,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (fk_userId) REFERENCES user(id),
  INDEX idx_user_active (fk_userId, is_active)
);

-- Create usage_limits table to define limits per subscription type
CREATE TABLE IF NOT EXISTS usage_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subscription_type ENUM('basic', 'professional', 'business') NOT NULL,
  limit_type ENUM('projects', 'single_images', 'content_edits') NOT NULL,
  daily_limit INT DEFAULT NULL,
  total_limit INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_subscription_limit (subscription_type, limit_type)
);

-- Insert default limits
INSERT INTO usage_limits (subscription_type, limit_type, daily_limit, total_limit) VALUES
-- Basic limits
('basic', 'projects', NULL, 1),                    -- 1 project (4-grid) total
('basic', 'single_images', NULL, 1),               -- 1 single image total
('basic', 'content_edits', NULL, 0),               -- No edits allowed

-- Professional limits  
('professional', 'projects', NULL, 4),             -- 4 projects total
('professional', 'single_images', NULL, 20),       -- 5 per project x 4 projects
('professional', 'content_edits', 5, NULL),        -- 5 edits per day

-- Business limits
('business', 'projects', NULL, 10),                -- 10 projects max
('business', 'single_images', NULL, 100),          -- 10 per project x 10 projects
('business', 'content_edits', NULL, NULL);         -- Unlimited edits

-- Create usage_tracking table to track actual usage
CREATE TABLE IF NOT EXISTS usage_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fk_userId INT NOT NULL,
  usage_type ENUM('project_creation', 'single_image_creation', 'content_edit') NOT NULL,
  fk_projectId INT,
  fk_contentId INT,
  usage_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fk_userId) REFERENCES user(id),
  FOREIGN KEY (fk_projectId) REFERENCES project(id),
  FOREIGN KEY (fk_contentId) REFERENCES content(id),
  INDEX idx_user_date (fk_userId, usage_date),
  INDEX idx_user_type_date (fk_userId, usage_type, usage_date)
);

-- Add is_free_initial column to project table to track the free 4-grid set
ALTER TABLE project ADD COLUMN is_free_initial BOOLEAN DEFAULT FALSE;

-- Add is_single_image column to content table
ALTER TABLE content ADD COLUMN is_single_image BOOLEAN DEFAULT FALSE;