-- EC2 Database Migration Script
-- This script migrates the live database to match the new structure
-- New structure: 1 Feed Set = 1 Content Request = Exactly 4 Images

-- IMPORTANT: Run these commands on EC2 after backing up the database:
-- mysqldump -u root -p amond > amond_backup_$(date +%Y%m%d_%H%M%S).sql

-- Step 1: Create migration log table
CREATE TABLE IF NOT EXISTS migration_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(255),
  affected_count INT,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Analyze current data structure
-- This will help us understand what needs to be migrated
SELECT 'Current Database Analysis' as '=== ANALYSIS ===';
SELECT 
  'Total Users' as metric, COUNT(*) as count FROM user
UNION ALL
SELECT 'Total Brands', COUNT(*) FROM brand
UNION ALL
SELECT 'Total Projects', COUNT(*) FROM project
UNION ALL
SELECT 'Total Content Requests', COUNT(*) FROM contentRequest
UNION ALL
SELECT 'Total Content Items', COUNT(*) FROM content;

-- Show content requests with varying image counts
SELECT 'Content Request Image Distribution' as '=== DISTRIBUTION ===';
SELECT image_count, COUNT(*) as request_count
FROM (
  SELECT cr.id, COUNT(c.id) as image_count
  FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
) as counts
GROUP BY image_count
ORDER BY image_count;

-- Step 3: Handle content requests with more than 4 images
-- For live data, we'll preserve the first 4 images and create new content requests for the rest

DELIMITER $$

CREATE PROCEDURE migrate_large_content_requests()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE cr_id INT;
  DECLARE proj_id INT;
  DECLARE total_images INT;
  DECLARE new_cr_id INT;
  DECLARE image_counter INT;
  DECLARE content_id INT;
  
  -- Cursor for content requests with more than 4 images
  DECLARE cr_cursor CURSOR FOR 
    SELECT cr.id, cr.fk_projectId, COUNT(c.id) as img_count
    FROM contentRequest cr
    JOIN content c ON cr.id = c.fk_contentRequestId
    GROUP BY cr.id
    HAVING COUNT(c.id) > 4;
    
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  
  OPEN cr_cursor;
  
  read_loop: LOOP
    FETCH cr_cursor INTO cr_id, proj_id, total_images;
    IF done THEN
      LEAVE read_loop;
    END IF;
    
    -- Keep first 4 images with original content request
    -- Move additional images to new content requests (4 at a time)
    SET image_counter = 0;
    
    -- Create cursor for images beyond the first 4
    BEGIN
      DECLARE done_inner INT DEFAULT FALSE;
      DECLARE content_cursor CURSOR FOR
        SELECT id FROM content 
        WHERE fk_contentRequestId = cr_id
        ORDER BY id
        LIMIT 1000 OFFSET 4;
      
      DECLARE CONTINUE HANDLER FOR NOT FOUND SET done_inner = TRUE;
      
      OPEN content_cursor;
      
      inner_loop: LOOP
        FETCH content_cursor INTO content_id;
        IF done_inner THEN
          LEAVE inner_loop;
        END IF;
        
        -- Create new content request every 4 images
        IF image_counter MOD 4 = 0 THEN
          INSERT INTO contentRequest (
            fk_projectId, status, imageRatio, brandPrompt, 
            imageDirection, contentKeyWord, competitorAnalysis, 
            trendResearch, sns, toneMannerList, createdAt, updatedAt
          )
          SELECT 
            fk_projectId, status, imageRatio, brandPrompt, 
            imageDirection, contentKeyWord, competitorAnalysis, 
            trendResearch, sns, toneMannerList, NOW(), NOW()
          FROM contentRequest WHERE id = cr_id;
          
          SET new_cr_id = LAST_INSERT_ID();
          
          INSERT INTO migration_log (action, affected_count)
          VALUES (CONCAT('Created new content request ', new_cr_id, ' from ', cr_id), 1);
        END IF;
        
        -- Update content to belong to new content request
        UPDATE content 
        SET fk_contentRequestId = new_cr_id
        WHERE id = content_id;
        
        SET image_counter = image_counter + 1;
        
      END LOOP inner_loop;
      
      CLOSE content_cursor;
    END;
    
  END LOOP read_loop;
  
  CLOSE cr_cursor;
  
  -- Log the migration
  INSERT INTO migration_log (action, affected_count)
  SELECT 'Split content requests with >4 images', COUNT(DISTINCT cr.id)
  FROM contentRequest cr
  JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
  HAVING COUNT(c.id) > 4;
  
END$$

DELIMITER ;

-- Step 4: Handle content requests with 0 images (optional - remove or keep)
INSERT INTO migration_log (action, affected_count)
SELECT 'Found empty content requests', COUNT(*)
FROM contentRequest cr
WHERE NOT EXISTS (
  SELECT 1 FROM content c WHERE c.fk_contentRequestId = cr.id
);

-- Option A: Delete empty content requests
-- DELETE FROM contentRequest 
-- WHERE NOT EXISTS (
--   SELECT 1 FROM content c WHERE c.fk_contentRequestId = contentRequest.id
-- );

-- Option B: Keep them for historical data

-- Step 5: Clean up test/dummy brands (customize based on your data)
INSERT INTO migration_log (action, affected_count)
SELECT 'Removed test brands', COUNT(*)
FROM brand 
WHERE name IN ('test', 'Test', 'TEST', '테스트') 
   OR name LIKE '%test%'
   OR LENGTH(name) < 2;

-- Delete test brands and cascade
-- DELETE FROM brand 
-- WHERE name IN ('test', 'Test', 'TEST', '테스트') 
--    OR name LIKE '%test%'
--    OR LENGTH(name) < 2;

-- Step 6: Execute the migration
CALL migrate_large_content_requests();

-- Step 7: Verify migration results
SELECT 'Migration Results' as '=== RESULTS ===';
SELECT * FROM migration_log ORDER BY executed_at;

-- Final verification
SELECT 'Final Content Request Distribution' as '=== FINAL ===';
SELECT image_count, COUNT(*) as request_count
FROM (
  SELECT cr.id, COUNT(c.id) as image_count
  FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
) as counts
GROUP BY image_count
ORDER BY image_count;

-- Step 8: Update constants and remove email notification table
-- This is optional based on your needs
-- DROP TABLE IF EXISTS emailNotification;

-- Step 9: Add index for better performance
ALTER TABLE content ADD INDEX idx_content_request (fk_contentRequestId);
ALTER TABLE contentRequest ADD INDEX idx_project (fk_projectId);

-- Clean up
DROP PROCEDURE IF EXISTS migrate_large_content_requests;

-- Final summary
SELECT 'Migration Complete!' as Status;
SELECT 
  'Total Content Requests' as metric, COUNT(*) as count FROM contentRequest
UNION ALL
SELECT 'Requests with 4 images', COUNT(*) FROM (
  SELECT cr.id FROM contentRequest cr
  JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
  HAVING COUNT(c.id) = 4
) as valid_requests
UNION ALL
SELECT 'Requests with <4 images', COUNT(*) FROM (
  SELECT cr.id FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
  HAVING COUNT(c.id) < 4
) as partial_requests
UNION ALL
SELECT 'Requests with >4 images', COUNT(*) FROM (
  SELECT cr.id FROM contentRequest cr
  JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
  HAVING COUNT(c.id) > 4
) as overflow_requests;