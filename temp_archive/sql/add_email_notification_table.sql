-- Drop existing table if it exists (be careful in production!)
DROP TABLE IF EXISTS `emailNotification`;

-- Create emailNotification table for tracking email notification requests
CREATE TABLE IF NOT EXISTS `emailNotification` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fk_userId` int(11) NOT NULL,
  `fk_contentRequestId` int(11) NOT NULL,
  `email` varchar(255) NOT NULL,
  `status` enum('pending','sent','failed') DEFAULT 'pending',
  `createdAt` datetime NOT NULL,
  `sentAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status_contentRequestId` (`status`, `fk_contentRequestId`),
  KEY `fk_userId` (`fk_userId`),
  KEY `fk_contentRequestId` (`fk_contentRequestId`),
  CONSTRAINT `emailNotification_ibfk_1` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `emailNotification_ibfk_2` FOREIGN KEY (`fk_contentRequestId`) REFERENCES `contentRequest` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add index for efficient querying of pending notifications (without WHERE clause for compatibility)
CREATE INDEX idx_pending_notifications ON emailNotification(fk_contentRequestId, status);