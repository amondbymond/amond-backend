-- EC2 Migration Continuation Script
-- Continue from where the previous migration stopped

-- Check if brands were already linked
SELECT 'Checking brand linkage...' as Status;
SELECT COUNT(*) as unlinked_projects FROM project WHERE fk_brandId IS NULL;

-- Link remaining projects to brands if not done
UPDATE project p
JOIN brand b ON p.name = b.name 
  AND (p.fk_userId = b.fk_userId OR (p.fk_userId IS NULL AND b.fk_userId = 1))
SET p.fk_brandId = b.id
WHERE p.fk_brandId IS NULL;

-- Handle remaining projects without brands
INSERT INTO brand (name, category, url, description, fk_userId, createdAt)
SELECT 
  COALESCE(p.name, CONCAT('Brand_', p.id)),
  p.category,
  p.url,
  p.description,
  COALESCE(p.fk_userId, 1),
  p.createdAt
FROM project p
WHERE p.fk_brandId IS NULL
ON DUPLICATE KEY UPDATE id=id;

UPDATE project p
SET p.fk_brandId = (
  SELECT b.id FROM brand b 
  WHERE (b.name = p.name OR b.name = CONCAT('Brand_', p.id))
  AND b.fk_userId = COALESCE(p.fk_userId, 1)
  LIMIT 1
)
WHERE p.fk_brandId IS NULL;

-- Add missing columns to contentRequest
ALTER TABLE contentRequest 
  ADD COLUMN IF NOT EXISTS `status` varchar(20) DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS `brandPrompt` text,
  ADD COLUMN IF NOT EXISTS `imageDirection` varchar(45) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `contentKeyWord` varchar(250) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `competitorAnalysis` text,
  ADD COLUMN IF NOT EXISTS `trendResearch` text,
  ADD COLUMN IF NOT EXISTS `sns` varchar(10) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Handle large content requests more carefully
-- First, let's see what we have
SELECT 'Content Request Distribution Before Split:' as Info;
SELECT image_count, COUNT(*) as request_count
FROM (
  SELECT cr.id, COUNT(c.id) as image_count
  FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
) as counts
GROUP BY image_count
ORDER BY image_count;

-- Create a simpler splitting procedure
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS split_large_requests()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE cr_id INT;
  DECLARE proj_id INT;
  DECLARE split_count INT DEFAULT 0;
  
  DECLARE cr_cursor CURSOR FOR 
    SELECT cr.id, cr.fk_projectId
    FROM contentRequest cr
    WHERE (
      SELECT COUNT(*) FROM content c 
      WHERE c.fk_contentRequestId = cr.id
    ) > 4
    ORDER BY cr.id;
    
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  
  OPEN cr_cursor;
  
  read_loop: LOOP
    FETCH cr_cursor INTO cr_id, proj_id;
    IF done THEN
      LEAVE read_loop;
    END IF;
    
    -- For each group of 4 images after the first 4, create a new request
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
      DATE_ADD(createdAt, INTERVAL group_num MINUTE), 
      fk_projectId, 'completed'
    FROM (
      SELECT cr.*, FLOOR((row_num - 1) / 4) as group_num
      FROM contentRequest cr
      CROSS JOIN (
        SELECT COUNT(*) - 4 as extra_images 
        FROM content 
        WHERE fk_contentRequestId = cr_id
      ) counts
      WHERE cr.id = cr_id AND counts.extra_images > 0
    ) base
    WHERE group_num > 0
    GROUP BY group_num;
    
    -- Update content assignments
    UPDATE content c
    JOIN (
      SELECT 
        c2.id,
        cr_id as orig_cr_id,
        FLOOR((@rn := @rn + 1 - 1) / 4) as group_num,
        @rn as row_num
      FROM content c2
      CROSS JOIN (SELECT @rn := 0) r
      WHERE c2.fk_contentRequestId = cr_id
      ORDER BY c2.id
    ) numbered ON c.id = numbered.id
    SET c.fk_contentRequestId = CASE
      WHEN numbered.group_num = 0 THEN cr_id
      ELSE (
        SELECT cr2.id 
        FROM contentRequest cr2 
        WHERE cr2.fk_projectId = proj_id 
          AND cr2.id > cr_id
          AND cr2.createdAt = DATE_ADD(
            (SELECT createdAt FROM contentRequest WHERE id = cr_id), 
            INTERVAL numbered.group_num MINUTE
          )
        ORDER BY cr2.id
        LIMIT 1
      )
    END
    WHERE c.fk_contentRequestId = cr_id;
    
    SET split_count = split_count + 1;
    
  END LOOP read_loop;
  
  CLOSE cr_cursor;
  
  INSERT INTO migration_log (action, affected_count, details)
  VALUES ('Split large content requests', split_count, 'Each request now has max 4 images');
  
END$$

DELIMITER ;

-- Execute the split
CALL split_large_requests();

-- Clean up empty requests
DELETE FROM contentRequest 
WHERE NOT EXISTS (
  SELECT 1 FROM content c WHERE c.fk_contentRequestId = contentRequest.id
);

INSERT INTO migration_log (action, affected_count)
VALUES ('Removed empty content requests', ROW_COUNT());

-- Create emailNotification table if not exists
CREATE TABLE IF NOT EXISTS `emailNotification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fk_userId` int DEFAULT NULL,
  `fk_contentRequestId` int DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `status` enum('pending','sent','failed') DEFAULT 'pending',
  `sentAt` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Final verification
SELECT '=== FINAL MIGRATION RESULTS ===' as Info;

SELECT 'Database Structure:' as Category, '' as Metric, '' as Count
UNION ALL
SELECT '', 'Total Users', COUNT(*) FROM user
UNION ALL
SELECT '', 'Total Brands', COUNT(*) FROM brand
UNION ALL  
SELECT '', 'Total Projects', COUNT(*) FROM project
UNION ALL
SELECT '', 'Projects with brands', COUNT(*) FROM project WHERE fk_brandId IS NOT NULL
UNION ALL
SELECT '', 'Projects without brands', COUNT(*) FROM project WHERE fk_brandId IS NULL
UNION ALL
SELECT '', 'Total Content Requests', COUNT(*) FROM contentRequest
UNION ALL
SELECT '', 'Total Content Items', COUNT(*) FROM content;

SELECT '=== CONTENT DISTRIBUTION AFTER MIGRATION ===' as Info;
SELECT image_count, COUNT(*) as request_count
FROM (
  SELECT cr.id, COUNT(c.id) as image_count
  FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
) as counts
GROUP BY image_count
ORDER BY image_count;

-- Clean up
DROP PROCEDURE IF EXISTS split_large_requests;