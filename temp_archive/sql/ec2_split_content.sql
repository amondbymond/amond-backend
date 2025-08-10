-- Simple script to split content requests with more than 4 images

-- Add missing columns first
ALTER TABLE contentRequest 
  ADD COLUMN IF NOT EXISTS `status` varchar(20) DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Show what we're about to split
SELECT 'Content requests to split:' as Info;
SELECT cr.id, cr.fk_projectId, COUNT(c.id) as image_count
FROM contentRequest cr
JOIN content c ON cr.id = c.fk_contentRequestId
GROUP BY cr.id
HAVING COUNT(c.id) > 4
ORDER BY cr.id;

-- For requests with 8 images: keep first 4, move next 4 to new request
-- Handle 8-image requests (most common)
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
  DATE_ADD(createdAt, INTERVAL 1 MINUTE), 
  fk_projectId, 'completed'
FROM contentRequest cr
WHERE cr.id IN (
  SELECT cr2.id FROM (
    SELECT cr3.id
    FROM contentRequest cr3
    JOIN content c ON cr3.id = c.fk_contentRequestId
    GROUP BY cr3.id
    HAVING COUNT(c.id) = 8
  ) as temp
);

-- Update content items for 8-image requests
UPDATE content c
JOIN (
  SELECT 
    c.id,
    c.fk_contentRequestId as old_cr_id,
    cr_new.new_cr_id,
    ROW_NUMBER() OVER (PARTITION BY c.fk_contentRequestId ORDER BY c.id) as rn
  FROM content c
  JOIN (
    SELECT 
      cr_old.id as old_cr_id,
      cr_new.id as new_cr_id
    FROM contentRequest cr_old
    JOIN contentRequest cr_new ON cr_new.fk_projectId = cr_old.fk_projectId
      AND cr_new.createdAt = DATE_ADD(cr_old.createdAt, INTERVAL 1 MINUTE)
    WHERE cr_old.id IN (
      SELECT cr2.id
      FROM contentRequest cr2
      JOIN content c2 ON cr2.id = c2.fk_contentRequestId
      GROUP BY cr2.id
      HAVING COUNT(c2.id) = 8
    )
  ) cr_new ON c.fk_contentRequestId = cr_new.old_cr_id
) numbered ON c.id = numbered.id
SET c.fk_contentRequestId = CASE 
  WHEN numbered.rn > 4 THEN numbered.new_cr_id
  ELSE c.fk_contentRequestId
END
WHERE numbered.rn > 4;

-- Handle 12-image requests (create 2 new requests)
-- First new request for images 5-8
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
  DATE_ADD(createdAt, INTERVAL 1 MINUTE), 
  fk_projectId, 'completed'
FROM contentRequest cr
WHERE cr.id IN (
  SELECT cr2.id FROM (
    SELECT cr3.id
    FROM contentRequest cr3
    JOIN content c ON cr3.id = c.fk_contentRequestId
    GROUP BY cr3.id
    HAVING COUNT(c.id) = 12
  ) as temp
);

-- Second new request for images 9-12
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
  DATE_ADD(createdAt, INTERVAL 2 MINUTE), 
  fk_projectId, 'completed'
FROM contentRequest cr
WHERE cr.id IN (
  SELECT cr2.id FROM (
    SELECT cr3.id
    FROM contentRequest cr3
    JOIN content c ON cr3.id = c.fk_contentRequestId
    GROUP BY cr3.id
    HAVING COUNT(c.id) = 12
  ) as temp
);

-- Handle 16-image request similarly
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
  DATE_ADD(createdAt, INTERVAL n MINUTE), 
  fk_projectId, 'completed'
FROM contentRequest cr
CROSS JOIN (SELECT 1 as n UNION SELECT 2 UNION SELECT 3) nums
WHERE cr.id IN (
  SELECT cr2.id FROM (
    SELECT cr3.id
    FROM contentRequest cr3
    JOIN content c ON cr3.id = c.fk_contentRequestId
    GROUP BY cr3.id
    HAVING COUNT(c.id) = 16
  ) as temp
);

-- Delete empty content requests
DELETE FROM contentRequest 
WHERE NOT EXISTS (
  SELECT 1 FROM content c WHERE c.fk_contentRequestId = contentRequest.id
);

INSERT INTO migration_log (action, affected_count)
VALUES ('Deleted empty content requests', ROW_COUNT());

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

-- Show final results
SELECT '=== FINAL CONTENT DISTRIBUTION ===' as Info;
SELECT image_count, COUNT(*) as request_count
FROM (
  SELECT cr.id, COUNT(c.id) as image_count
  FROM contentRequest cr
  LEFT JOIN content c ON cr.id = c.fk_contentRequestId
  GROUP BY cr.id
) as counts
GROUP BY image_count
ORDER BY image_count;