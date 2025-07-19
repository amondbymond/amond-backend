-- Add enhanced membership tier management to user table
-- The existing 'grade' column will be updated to support proper membership tiers

-- Update the grade column to support membership tiers
ALTER TABLE `user` 
MODIFY COLUMN `grade` VARCHAR(20) DEFAULT 'basic' 
COMMENT 'Membership tier: basic, pro, business, premium';

-- Update existing records from 'C' to 'basic' (if any exist)
UPDATE `user` SET `grade` = 'basic' WHERE `grade` = 'C' OR `grade` IS NULL;

-- Add membership tier related columns
ALTER TABLE `user` 
ADD COLUMN `membershipStartDate` DATETIME NULL COMMENT 'When current membership tier started',
ADD COLUMN `membershipEndDate` DATETIME NULL COMMENT 'When current membership tier expires (NULL for basic/free)',
ADD COLUMN `membershipStatus` ENUM('active', 'expired', 'cancelled') DEFAULT 'active' COMMENT 'Current membership status';

-- Create an index for faster membership queries
CREATE INDEX `idx_user_membership` ON `user` (`grade`, `membershipStatus`, `membershipEndDate`);

-- Insert initial membership tier definitions (optional reference table)
CREATE TABLE IF NOT EXISTS `membership_tiers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tier_name` VARCHAR(20) NOT NULL UNIQUE,
  `tier_display_name` VARCHAR(50) NOT NULL,
  `monthly_price` INT NOT NULL COMMENT 'Price in KRW',
  `monthly_grid_sets` INT NOT NULL COMMENT 'Max photo grid sets per month (월 콘텐츠 발행)',
  `content_edit_limit` INT NOT NULL COMMENT 'Max edits per content (콘텐츠별 수)',
  `planning_sets_limit` INT NOT NULL COMMENT 'Max planning sets (기획도)',
  `manager_support` BOOLEAN DEFAULT FALSE,
  `team_management` BOOLEAN DEFAULT FALSE,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT 'Reference table for membership tier definitions';

-- Insert membership tier data
INSERT INTO `membership_tiers` (`tier_name`, `tier_display_name`, `monthly_price`, `monthly_grid_sets`, `content_edit_limit`, `planning_sets_limit`, `manager_support`, `team_management`) VALUES
('basic', '베이직', 0, 1, 2, 1, FALSE, FALSE),
('pro', '프로', 9900, 4, 3, 4, FALSE, FALSE),
('business', '비즈니스', 29000, 10, 10, 10, TRUE, TRUE),
('premium', '프리미엄', 79000, -1, -1, -1, TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  `tier_display_name` = VALUES(`tier_display_name`),
  `monthly_price` = VALUES(`monthly_price`),
  `monthly_grid_sets` = VALUES(`monthly_grid_sets`),
  `content_edit_limit` = VALUES(`content_edit_limit`),
  `planning_sets_limit` = VALUES(`planning_sets_limit`),
  `manager_support` = VALUES(`manager_support`),
  `team_management` = VALUES(`team_management`);