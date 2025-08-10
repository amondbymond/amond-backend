-- EC2 Database Migration Script: Add Brand Layer and Standardize to 4 Images
-- Current structure: User → Projects → Content Requests → Content
-- New structure: User → Brands → Projects → Content Requests (4 images each)

-- IMPORTANT: Backup first!
-- mysqldump -u root -p'QkdwkWkd12@@' amond > amond_ec2_backup_$(date +%Y%m%d_%H%M%S).sql

-- Step 1: Create brand table
CREATE TABLE IF NOT EXISTS `brand` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `category` varchar(50) DEFAULT NULL,
  `url` varchar(500) DEFAULT NULL,
  `description` text,
  `fk_userId` int NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_brand_user` (`fk_userId`),
  CONSTRAINT `brand_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Step 2: Create migration log
CREATE TABLE IF NOT EXISTS migration_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(255),
  affected_count INT,
  details TEXT,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Migrate projects to brands
-- Each unique project name becomes a brand
INSERT INTO brand (name, category, url, description, fk_userId, createdAt)
SELECT 
  name,
  category,
  url,
  description,
  COALESCE(fk_userId, 1) as fk_userId, -- Default to user 1 if NULL
  MIN(createdAt) as createdAt
FROM project
WHERE name IS NOT NULL
GROUP BY name, category, url, description, fk_userId;

INSERT INTO migration_log (action, affected_count)
VALUES ('Created brands from unique project names', ROW_COUNT());

-- Step 4: Add fk_brandId to project table
ALTER TABLE project ADD COLUMN `fk_brandId` int DEFAULT NULL;
ALTER TABLE project ADD KEY `idx_project_brand` (`fk_brandId`);
ALTER TABLE project ADD CONSTRAINT `project_brand` FOREIGN KEY (`fk_brandId`) REFERENCES `brand` (`id`) ON DELETE CASCADE;

-- Step 5: Link projects to their corresponding brands
UPDATE project p
JOIN brand b ON p.name = b.name 
  AND (p.fk_userId = b.fk_userId OR (p.fk_userId IS NULL AND b.fk_userId = 1))
SET p.fk_brandId = b.id;

INSERT INTO migration_log (action, affected_count, details)
VALUES ('Linked projects to brands', ROW_COUNT(), 'Based on matching name and user');

-- Handle projects without matching brands (create individual brands)
INSERT INTO brand (name, category, url, description, fk_userId, createdAt)
SELECT 
  CONCAT('Brand_', p.id),
  p.category,
  p.url,
  p.description,
  COALESCE(p.fk_userId, 1),
  p.createdAt
FROM project p
WHERE p.fk_brandId IS NULL AND p.name IS NULL;

UPDATE project p
JOIN brand b ON b.name = CONCAT('Brand_', p.id)
SET p.fk_brandId = b.id
WHERE p.fk_brandId IS NULL;

-- Step 6: Handle content requests with more than 4 images
-- Split them into multiple content requests with 4 images each

DELIMITER $$

CREATE PROCEDURE split_large_content_requests()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE cr_id INT;
  DECLARE proj_id INT;
  DECLARE total_images INT;
  DECLARE processed_count INT DEFAULT 0;
  
  DECLARE cr_cursor CURSOR FOR 
    SELECT cr.id, cr.fk_projectId, COUNT(c.id) as img_count
    FROM contentRequest cr
    JOIN content c ON cr.id = c.fk_contentRequestId
    GROUP BY cr.id
    HAVING COUNT(c.id) > 4
    ORDER BY cr.id;
    
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  
  OPEN cr_cursor;
  
  read_loop: LOOP
    FETCH cr_cursor INTO cr_id, proj_id, total_images;
    IF done THEN
      LEAVE read_loop;
    END IF;
    
    -- For each content request with >4 images, keep first 4 and create new requests
    -- for the rest (in groups of 4)
    SET @row_num = 0;
    SET @new_cr_id = cr_id;
    
    -- Create new content requests for images 5+
    INSERT INTO contentRequest (
      fk_projectId, status, imageRatio, brandPrompt, 
      imageDirection, contentKeyWord, competitorAnalysis, 
      trendResearch, sns, toneMannerList, createdAt, updatedAt
    )
    SELECT 
      fk_projectId, status, imageRatio, brandPrompt, 
      imageDirection, contentKeyWord, competitorAnalysis, 
      trendResearch, sns, toneMannerList, 
      DATE_ADD(createdAt, INTERVAL (FLOOR((rn-1)/4)+1) MINUTE) as createdAt,
      NOW() as updatedAt
    FROM (
      SELECT 
        cr.*,
        @row_num := @row_num + 1 as rn
      FROM contentRequest cr
      CROSS JOIN (
        SELECT COUNT(*) as cnt FROM content WHERE fk_contentRequestId = cr_id
      ) c
      WHERE cr.id = cr_id
    ) base
    WHERE FLOOR((rn-1)/4) > 0
    GROUP BY FLOOR((rn-1)/4);
    
    -- Update content items to belong to appropriate content requests
    SET @row_num = 0;
    UPDATE content c
    JOIN (
      SELECT 
        id,
        @row_num := @row_num + 1 as rn,
        CASE 
          WHEN @row_num <= 4 THEN cr_id
          ELSE (
            SELECT cr2.id 
            FROM contentRequest cr2 
            WHERE cr2.fk_projectId = proj_id 
              AND cr2.id > cr_id
              AND cr2.createdAt = DATE_ADD(
                (SELECT createdAt FROM contentRequest WHERE id = cr_id), 
                INTERVAL FLOOR((@row_num-1)/4) MINUTE
              )
            LIMIT 1
          )
        END as new_cr_id
      FROM content
      WHERE fk_contentRequestId = cr_id
      ORDER BY id
    ) numbered ON c.id = numbered.id
    SET c.fk_contentRequestId = numbered.new_cr_id
    WHERE numbered.new_cr_id IS NOT NULL;
    
    SET processed_count = processed_count + 1;
    
  END LOOP read_loop;
  
  CLOSE cr_cursor;
  
  INSERT INTO migration_log (action, affected_count, details)
  VALUES ('Split content requests with >4 images', processed_count, 'Each now has max 4 images');
  
END$$

DELIMITER ;

CALL split_large_content_requests();
DROP PROCEDURE split_large_content_requests;

-- Step 7: Remove empty content requests
DELETE FROM contentRequest 
WHERE NOT EXISTS (
  SELECT 1 FROM content c WHERE c.fk_contentRequestId = contentRequest.id
);

INSERT INTO migration_log (action, affected_count)
VALUES ('Removed empty content requests', ROW_COUNT());

-- Step 8: Add emailNotification table (even though we're removing the feature, for consistency)
CREATE TABLE IF NOT EXISTS `emailNotification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fk_userId` int DEFAULT NULL,
  `fk_contentRequestId` int DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `status` enum('pending','sent','failed') DEFAULT 'pending',
  `sentAt` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_user` (`fk_userId`),
  KEY `idx_email_request` (`fk_contentRequestId`),
  KEY `idx_email_status` (`status`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Step 9: Verify migration
SELECT '=== MIGRATION SUMMARY ===' as Info;
SELECT * FROM migration_log ORDER BY executed_at;

SELECT '=== FINAL STRUCTURE ===' as Info;
SELECT 'Total Users' as metric, COUNT(*) as count FROM user
UNION ALL
SELECT 'Total Brands', COUNT(*) FROM brand
UNION ALL  
SELECT 'Total Projects', COUNT(*) FROM project
UNION ALL
SELECT 'Projects with brands', COUNT(*) FROM project WHERE fk_brandId IS NOT NULL
UNION ALL
SELECT 'Total Content Requests', COUNT(*) FROM contentRequest
UNION ALL
SELECT 'Total Content Items', COUNT(*) FROM content;

SELECT '=== CONTENT DISTRIBUTION ===' as Info;
SELECT image_count, COUNT(*) as request_count
FROM (
  SELECT cr.id, COUNT(c.id) as image_count
  FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
) as counts
GROUP BY image_count
ORDER BY image_count;

-- Step 10: Update foreign key to remove fk_userId from project (optional)
-- This enforces the new hierarchy: User -> Brand -> Project
-- ALTER TABLE project DROP FOREIGN KEY project_user;
-- ALTER TABLE project DROP COLUMN fk_userId;