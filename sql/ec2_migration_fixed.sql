-- EC2 Database Migration Script (Fixed Version)
-- Handles the actual EC2 table structure

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
INSERT INTO brand (name, category, url, description, fk_userId, createdAt)
SELECT 
  name,
  category,
  url,
  description,
  COALESCE(fk_userId, 1) as fk_userId,
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

-- Handle projects without names
INSERT INTO brand (name, category, url, description, fk_userId, createdAt)
SELECT 
  CONCAT('Brand_', p.id),
  p.category,
  p.url,
  p.description,
  COALESCE(p.fk_userId, 1),
  p.createdAt
FROM project p
WHERE p.fk_brandId IS NULL;

UPDATE project p
JOIN brand b ON b.name = CONCAT('Brand_', p.id)
SET p.fk_brandId = b.id
WHERE p.fk_brandId IS NULL;

-- Step 6: Add missing columns to contentRequest table
ALTER TABLE contentRequest 
  ADD COLUMN IF NOT EXISTS `status` varchar(20) DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS `brandPrompt` text,
  ADD COLUMN IF NOT EXISTS `imageDirection` varchar(45) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `contentKeyWord` varchar(250) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `competitorAnalysis` text,
  ADD COLUMN IF NOT EXISTS `trendResearch` text,
  ADD COLUMN IF NOT EXISTS `sns` varchar(10) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Step 7: Handle content requests with more than 4 images
DELIMITER $$

CREATE PROCEDURE split_content_requests()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE cr_id INT;
  DECLARE proj_id INT;
  DECLARE content_count INT;
  DECLARE new_cr_id INT;
  DECLARE offset_count INT;
  
  DECLARE cr_cursor CURSOR FOR 
    SELECT cr.id, cr.fk_projectId, COUNT(c.id) as cnt
    FROM contentRequest cr
    JOIN content c ON cr.id = c.fk_contentRequestId
    GROUP BY cr.id
    HAVING COUNT(c.id) > 4;
    
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  
  OPEN cr_cursor;
  
  read_loop: LOOP
    FETCH cr_cursor INTO cr_id, proj_id, content_count;
    IF done THEN
      LEAVE read_loop;
    END IF;
    
    -- Keep first 4 images with original request
    -- Create new requests for remaining images (4 at a time)
    SET offset_count = 4;
    
    WHILE offset_count < content_count DO
      -- Create new content request
      INSERT INTO contentRequest (
        trendIssue, snsEvent, essentialKeyword, competitor,
        uploadCycle, toneMannerList, imageVideoRatio, imageRatio,
        directionList, searchResult, searchToken, subjectToken,
        createdAt, fk_projectId, status
      )
      SELECT 
        trendIssue, snsEvent, essentialKeyword, competitor,
        uploadCycle, toneMannerList, imageVideoRatio, imageRatio,
        directionList, searchResult, searchToken, subjectToken,
        DATE_ADD(createdAt, INTERVAL (offset_count DIV 4) MINUTE), 
        fk_projectId, 'completed'
      FROM contentRequest WHERE id = cr_id;
      
      SET new_cr_id = LAST_INSERT_ID();
      
      -- Move next 4 images to new request
      UPDATE content c
      JOIN (
        SELECT id, @row_num := @row_num + 1 as rn
        FROM content
        WHERE fk_contentRequestId = cr_id
        ORDER BY id
        LIMIT 4 OFFSET offset_count
      ) numbered ON c.id = numbered.id
      SET c.fk_contentRequestId = new_cr_id;
      
      SET offset_count = offset_count + 4;
      SET @row_num = 0;
    END WHILE;
    
  END LOOP read_loop;
  
  CLOSE cr_cursor;
  
  INSERT INTO migration_log (action, affected_count)
  SELECT 'Split content requests with >4 images', COUNT(DISTINCT cr.id)
  FROM contentRequest cr
  JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
  HAVING COUNT(c.id) > 4;
  
END$$

DELIMITER ;

-- Initialize row counter
SET @row_num = 0;

-- Call the procedure
CALL split_content_requests();
DROP PROCEDURE split_content_requests;

-- Step 8: Remove empty content requests
DELETE FROM contentRequest 
WHERE NOT EXISTS (
  SELECT 1 FROM content c WHERE c.fk_contentRequestId = contentRequest.id
);

INSERT INTO migration_log (action, affected_count)
VALUES ('Removed empty content requests', ROW_COUNT());

-- Step 9: Create emailNotification table
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

-- Step 10: Show migration results
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