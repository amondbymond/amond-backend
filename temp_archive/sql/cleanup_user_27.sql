-- Clean all data for user 27
-- Run this in your MySQL client to start fresh for user 27

-- First, disable foreign key checks to avoid constraint errors
SET FOREIGN_KEY_CHECKS = 0;

-- Show what we're about to delete
SELECT 'User 27 - Projects to delete:' as 'Status', COUNT(*) as 'Count' FROM project WHERE fk_userId = 27
UNION ALL
SELECT 'User 27 - Brands to delete:', COUNT(*) FROM brand WHERE fk_userId = 27;

-- Delete content for user 27's projects
DELETE c FROM content c
JOIN contentrequest cr ON c.fk_contentRequestId = cr.id
JOIN project p ON cr.fk_projectId = p.id
WHERE p.fk_userId = 27;

-- Delete content requests for user 27's projects
DELETE cr FROM contentrequest cr
JOIN project p ON cr.fk_projectId = p.id
WHERE p.fk_userId = 27;

-- Delete regenerate logs for user 27
DELETE FROM regeneratelog WHERE fk_userId = 27;

-- Delete all projects for user 27
DELETE FROM project WHERE fk_userId = 27;

-- Delete brands created by user 27
DELETE FROM brand WHERE fk_userId = 27;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Verify cleanup
SELECT 'User 27 - Remaining projects:' as 'Status', COUNT(*) as 'Count' FROM project WHERE fk_userId = 27
UNION ALL
SELECT 'User 27 - Remaining brands:', COUNT(*) FROM brand WHERE fk_userId = 27;