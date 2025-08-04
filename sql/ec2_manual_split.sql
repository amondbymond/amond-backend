-- Manual splitting of content requests to 4 images each
-- This approach gives us better control

-- Add missing columns
ALTER TABLE contentRequest 
  ADD COLUMN IF NOT EXISTS `status` varchar(20) DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Create emailNotification table
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

-- Since most requests have 4 or 8 images, let's leave them as is
-- The new system will enforce 4 images per request going forward

-- Just delete the empty content requests
DELETE FROM contentRequest 
WHERE id IN (
  SELECT id FROM (
    SELECT cr.id
    FROM contentRequest cr
    WHERE NOT EXISTS (
      SELECT 1 FROM content c WHERE c.fk_contentRequestId = cr.id
    )
  ) as temp
);

-- Log what we have
INSERT INTO migration_log (action, affected_count, details)
VALUES (
  'EC2 Migration Complete', 
  (SELECT COUNT(*) FROM contentRequest),
  'Brand structure added. Content requests preserved with 4/8/12/16 images for historical data.'
);

-- Final summary
SELECT '=== EC2 MIGRATION COMPLETE ===' as Status;

SELECT 'Database Structure:' as Info, '' as Value
UNION ALL
SELECT 'Total Users:', COUNT(*) FROM user
UNION ALL
SELECT 'Total Brands:', COUNT(*) FROM brand
UNION ALL  
SELECT 'Total Projects:', COUNT(*) FROM project
UNION ALL
SELECT 'Projects with brands:', COUNT(*) FROM project WHERE fk_brandId IS NOT NULL
UNION ALL
SELECT 'Total Content Requests:', COUNT(*) FROM contentRequest
UNION ALL
SELECT 'Total Content Items:', COUNT(*) FROM content;

SELECT '' as '';
SELECT 'Content Distribution (images per request):' as Info, '' as Count;
SELECT CONCAT(image_count, ' images'), COUNT(*) as requests
FROM (
  SELECT cr.id, COUNT(c.id) as image_count
  FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
) as counts
GROUP BY image_count
ORDER BY image_count;

SELECT '' as '';
SELECT 'Sample Brand Hierarchy:' as Info, '' as Value;
SELECT 
  CONCAT('User ', u.id, ' → Brand "', b.name, '" → ', COUNT(DISTINCT p.id), ' projects → ', COUNT(DISTINCT cr.id), ' content requests') as hierarchy
FROM user u
JOIN brand b ON u.id = b.fk_userId
JOIN project p ON b.id = p.fk_brandId
LEFT JOIN contentRequest cr ON p.id = cr.fk_projectId
GROUP BY u.id, b.id
LIMIT 5;