-- Create brands table to hold brand information
CREATE TABLE IF NOT EXISTS brand (
    id INT(11) NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    url VARCHAR(512),
    description TEXT,
    fk_userId INT(11),
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_user (fk_userId),
    FOREIGN KEY (fk_userId) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add brand reference to project table (which will now represent feed sets)
ALTER TABLE project 
ADD COLUMN fk_brandId INT(11) DEFAULT NULL AFTER fk_userId,
ADD INDEX idx_brand (fk_brandId),
ADD FOREIGN KEY (fk_brandId) REFERENCES brand(id) ON DELETE CASCADE;

-- Migrate existing projects to brands
-- This creates a brand for each unique name/category/url combination
INSERT INTO brand (name, category, url, description, fk_userId, createdAt)
SELECT DISTINCT name, category, url, description, fk_userId, MIN(createdAt)
FROM project
GROUP BY name, category, url, description, fk_userId;

-- Update projects to reference their corresponding brands
UPDATE project p
JOIN brand b ON p.name = b.name 
    AND (p.category = b.category OR (p.category IS NULL AND b.category IS NULL))
    AND (p.url = b.url OR (p.url IS NULL AND b.url IS NULL))
    AND (p.fk_userId = b.fk_userId OR (p.fk_userId IS NULL AND b.fk_userId IS NULL))
SET p.fk_brandId = b.id;