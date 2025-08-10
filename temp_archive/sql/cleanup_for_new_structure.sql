-- Amond Database Cleanup Script for New Structure
-- This script cleans up legacy data to match the new structure:
-- 1 Feed Set = 1 Content Request = Exactly 4 Images
-- Run this before deploying to EC2

-- First, create a backup log of what we're removing
CREATE TABLE IF NOT EXISTS cleanup_log (
  action VARCHAR(255),
  count INT,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Disable foreign key checks for cleanup
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Remove old content requests with more than 4 images
INSERT INTO cleanup_log (action, count)
SELECT 'Removed content requests with >4 images', COUNT(DISTINCT cr.id)
FROM contentRequest cr
JOIN content c ON cr.id = c.fk_contentRequestId
GROUP BY cr.id
HAVING COUNT(c.id) > 4;

-- Delete content items for old content requests
DELETE c FROM content c
JOIN (
  SELECT cr.id 
  FROM contentRequest cr
  JOIN content c2 ON cr.id = c2.fk_contentRequestId
  GROUP BY cr.id
  HAVING COUNT(c2.id) > 4
) old_cr ON c.fk_contentRequestId = old_cr.id;

-- Delete the old content requests
DELETE cr FROM contentRequest cr
WHERE cr.id IN (
  SELECT id FROM (
    SELECT cr2.id 
    FROM contentRequest cr2
    JOIN content c ON cr2.id = c.fk_contentRequestId
    GROUP BY cr2.id
    HAVING COUNT(c.id) > 4
  ) as temp
);

-- 2. Clean up test/dummy brands and their related data
INSERT INTO cleanup_log (action, count)
SELECT 'Removed test brands', COUNT(*)
FROM brand WHERE name IN ('ff', 'dddd', 'asf', 'test', '') OR name IS NULL;

-- Get test brand IDs
CREATE TEMPORARY TABLE test_brands AS
SELECT id FROM brand 
WHERE name IN ('ff', 'dddd', 'asf', 'test', '') 
   OR name IS NULL
   OR name LIKE '%test%';

-- Delete related data for test brands
DELETE FROM content WHERE fk_contentRequestId IN (
  SELECT cr.id FROM contentRequest cr
  JOIN project p ON cr.fk_projectId = p.id
  WHERE p.fk_brandId IN (SELECT id FROM test_brands)
);

DELETE FROM contentRequest WHERE fk_projectId IN (
  SELECT id FROM project WHERE fk_brandId IN (SELECT id FROM test_brands)
);

DELETE FROM project WHERE fk_brandId IN (SELECT id FROM test_brands);
DELETE FROM brand WHERE id IN (SELECT id FROM test_brands);

DROP TEMPORARY TABLE test_brands;

-- 3. Remove empty projects (no content requests)
INSERT INTO cleanup_log (action, count)
SELECT 'Removed empty projects', COUNT(*)
FROM project p
WHERE NOT EXISTS (SELECT 1 FROM contentRequest cr WHERE cr.fk_projectId = p.id);

DELETE FROM project 
WHERE id NOT IN (SELECT DISTINCT fk_projectId FROM contentRequest WHERE fk_projectId IS NOT NULL);

-- 4. Clean up orphaned content (no content request)
INSERT INTO cleanup_log (action, count)
SELECT 'Removed orphaned content', COUNT(*)
FROM content 
WHERE fk_contentRequestId NOT IN (SELECT id FROM contentRequest);

DELETE FROM content 
WHERE fk_contentRequestId NOT IN (SELECT id FROM contentRequest);

-- 5. Clean up brands with no projects
INSERT INTO cleanup_log (action, count)
SELECT 'Removed empty brands', COUNT(*)
FROM brand b
WHERE NOT EXISTS (SELECT 1 FROM project p WHERE p.fk_brandId = b.id);

DELETE FROM brand 
WHERE id NOT IN (SELECT DISTINCT fk_brandId FROM project WHERE fk_brandId IS NOT NULL);

-- 6. Remove users with no brands (except recently created)
INSERT INTO cleanup_log (action, count)
SELECT 'Removed inactive users without brands', COUNT(*)
FROM user u
WHERE NOT EXISTS (SELECT 1 FROM brand b WHERE b.fk_userId = u.id)
  AND u.createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND (u.email IS NULL OR u.email = '');

DELETE FROM user 
WHERE id NOT IN (SELECT DISTINCT fk_userId FROM brand WHERE fk_userId IS NOT NULL)
  AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND (email IS NULL OR email = '');

-- 7. Clean up old regenerate logs
INSERT INTO cleanup_log (action, count)
SELECT 'Removed old regenerate logs', COUNT(*)
FROM regenerateLog
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 60 DAY);

DELETE FROM regenerateLog 
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 60 DAY);

-- 8. Clean up old email notifications
INSERT INTO cleanup_log (action, count)
SELECT 'Removed old email notifications', COUNT(*)
FROM emailNotification
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY);

DELETE FROM emailNotification
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Show cleanup summary
SELECT * FROM cleanup_log ORDER BY executed_at;

-- Show final database state
SELECT 'Final Database State' as '=== SUMMARY ===';
SELECT 
  'Total Users' as metric, COUNT(*) as count FROM user
UNION ALL
SELECT 'Users with Brands', COUNT(DISTINCT fk_userId) FROM brand
UNION ALL  
SELECT 'Total Brands', COUNT(*) FROM brand
UNION ALL
SELECT 'Total Projects', COUNT(*) FROM project
UNION ALL
SELECT 'Total Content Requests', COUNT(*) FROM contentRequest
UNION ALL
SELECT 'Content Requests with exactly 4 images', COUNT(*) FROM (
  SELECT cr.id FROM contentRequest cr
  JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
  HAVING COUNT(c.id) = 4
) as valid_requests
UNION ALL
SELECT 'Total Content Items', COUNT(*) FROM content;