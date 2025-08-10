-- Clean slate script - Delete all projects and related data
-- Run this to start fresh

-- First, disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Delete all content-related data
DELETE FROM content;
DELETE FROM contentrequest;
DELETE FROM regeneratelog;

-- Delete all projects
DELETE FROM project;

-- Delete all brands
DELETE FROM brand;

-- Optional: If you want to keep users but remove their projects
-- If you want to delete users too, uncomment the next line
-- DELETE FROM user;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Show what's left
SELECT 'Brands remaining:' as 'Status', COUNT(*) as 'Count' FROM brand
UNION ALL
SELECT 'Projects remaining:', COUNT(*) FROM project
UNION ALL
SELECT 'Content requests remaining:', COUNT(*) FROM contentrequest
UNION ALL
SELECT 'Content remaining:', COUNT(*) FROM content
UNION ALL
SELECT 'Users remaining:', COUNT(*) FROM user;