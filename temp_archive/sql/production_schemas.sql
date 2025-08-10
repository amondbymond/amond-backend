-- Table: aiPrompt
       Table: aiPrompt
CREATE TABLE `aiPrompt` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(20) DEFAULT NULL,
  `prompt` varchar(3000) DEFAULT NULL,
  `required` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

-- Table: billing_keys
       Table: billing_keys
CREATE TABLE `billing_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fk_userId` int NOT NULL,
  `orderNumber` varchar(100) NOT NULL,
  `billingKey` varchar(255) NOT NULL COMMENT 'INICIS TID used as billing key',
  `cardNumber` varchar(20) NOT NULL COMMENT 'Masked card number',
  `cardName` varchar(50) NOT NULL COMMENT 'Card company name',
  `status` enum('active','inactive') DEFAULT 'active',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_userId` (`fk_userId`),
  KEY `idx_billingKey` (`billingKey`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_billing_keys_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='사용자 빌링키 정보'
;

-- Table: brand
       Table: brand
CREATE TABLE `brand` (
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
) ENGINE=InnoDB AUTO_INCREMENT=255 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

-- Table: content
       Table: content
CREATE TABLE `content` (
  `id` int NOT NULL AUTO_INCREMENT,
  `postDate` datetime DEFAULT NULL,
  `subject` varchar(60) DEFAULT NULL,
  `imageUrl` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `aiPrompt` varchar(300) DEFAULT NULL,
  `caption` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `videoScript` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `imageToken` smallint DEFAULT NULL,
  `textToken` smallint DEFAULT NULL,
  `imageLog` varchar(15) DEFAULT NULL,
  `fk_contentRequestId` int NOT NULL,
  `direction` varchar(50) DEFAULT '정보형',
  PRIMARY KEY (`id`),
  KEY `content_ contentRequest_idx` (`fk_contentRequestId`),
  CONSTRAINT `content_ contentRequest` FOREIGN KEY (`fk_contentRequestId`) REFERENCES `contentRequest` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=545 DEFAULT CHARSET=utf8mb3
;

-- Table: contentRequest
       Table: contentRequest
CREATE TABLE `contentRequest` (
  `id` int NOT NULL AUTO_INCREMENT,
  `trendIssue` varchar(45) DEFAULT NULL,
  `snsEvent` varchar(45) DEFAULT NULL,
  `essentialKeyword` varchar(45) DEFAULT NULL,
  `competitor` varchar(250) DEFAULT NULL,
  `uploadCycle` varchar(5) DEFAULT NULL,
  `toneMannerList` varchar(60) DEFAULT NULL,
  `imageVideoRatio` tinyint DEFAULT NULL,
  `imageRatio` varchar(5) DEFAULT NULL,
  `directionList` varchar(25) DEFAULT NULL,
  `searchResult` varchar(800) DEFAULT NULL,
  `searchToken` smallint DEFAULT NULL,
  `subjectToken` smallint DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `fk_projectId` int NOT NULL,
  `status` varchar(20) DEFAULT 'completed',
  PRIMARY KEY (`id`),
  KEY `contentRequest_project_idx` (`fk_projectId`),
  CONSTRAINT `contentRequest_project` FOREIGN KEY (`fk_projectId`) REFERENCES `project` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=92 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

-- Table: emailNotification
       Table: emailNotification
CREATE TABLE `emailNotification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fk_userId` int DEFAULT NULL,
  `fk_contentRequestId` int DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `status` enum('pending','sent','failed') DEFAULT 'pending',
  `sentAt` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

-- Table: membership_tiers
       Table: membership_tiers
CREATE TABLE `membership_tiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tier_name` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tier_display_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `monthly_price` int NOT NULL COMMENT 'Price in KRW',
  `monthly_grid_sets` int NOT NULL COMMENT 'Max photo grid sets per month (월 콘텐츠 발행)',
  `content_edit_limit` int NOT NULL COMMENT 'Max edits per content (콘텐츠별 수)',
  `planning_sets_limit` int NOT NULL COMMENT 'Max planning sets (기획도)',
  `manager_support` tinyint(1) DEFAULT '0',
  `team_management` tinyint(1) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tier_name` (`tier_name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Reference table for membership tier definitions'
;

-- Table: migration_log
       Table: migration_log
CREATE TABLE `migration_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `affected_count` int DEFAULT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
  `executed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
;

-- Table: payment_logs
       Table: payment_logs
CREATE TABLE `payment_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fk_userId` int NOT NULL,
  `orderNumber` varchar(100) NOT NULL,
  `billingKey` varchar(255) DEFAULT NULL,
  `price` int NOT NULL,
  `goodName` varchar(200) NOT NULL,
  `buyerName` varchar(100) NOT NULL,
  `buyerTel` varchar(20) NOT NULL,
  `buyerEmail` varchar(100) NOT NULL,
  `paymentStatus` enum('success','failed','cancelled','refunded') NOT NULL,
  `inicisResponse` json DEFAULT NULL COMMENT 'Full INICIS response',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_userId` (`fk_userId`),
  KEY `idx_orderNumber` (`orderNumber`),
  KEY `idx_paymentStatus` (`paymentStatus`),
  KEY `idx_createdAt` (`createdAt`),
  CONSTRAINT `fk_payment_logs_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='결제 내역'
;

-- Table: payment_subscriptions
       Table: payment_subscriptions
CREATE TABLE `payment_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fk_userId` int NOT NULL,
  `planType` varchar(20) NOT NULL COMMENT 'basic, pro, business, premium',
  `status` enum('active','suspended','cancelled','expired') DEFAULT 'active',
  `startDate` date NOT NULL,
  `nextBillingDate` date NOT NULL,
  `price` int NOT NULL COMMENT 'Monthly price in KRW',
  `billingCycle` enum('monthly','yearly') DEFAULT 'monthly',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_userId` (`fk_userId`),
  KEY `idx_status` (`status`),
  KEY `idx_nextBillingDate` (`nextBillingDate`),
  CONSTRAINT `fk_subscriptions_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='구독 정보'
;

-- Table: project
       Table: project
CREATE TABLE `project` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(30) DEFAULT NULL,
  `sessionName` varchar(255) DEFAULT NULL,
  `category` varchar(20) DEFAULT NULL,
  `url` varchar(300) DEFAULT NULL,
  `imageList` varchar(1000) DEFAULT NULL,
  `reasonList` varchar(100) DEFAULT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `isActive` tinyint(1) DEFAULT '1',
  `lastAccessedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fk_userId` int DEFAULT NULL,
  `fk_brandId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_user_idx` (`fk_userId`),
  KEY `idx_project_user_active` (`fk_userId`,`isActive`,`lastAccessedAt`),
  KEY `idx_project_brand` (`fk_brandId`),
  CONSTRAINT `project_brand` FOREIGN KEY (`fk_brandId`) REFERENCES `brand` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=86 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

-- Table: regenerateLog
       Table: regenerateLog
CREATE TABLE `regenerateLog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `caption` tinyint DEFAULT '0',
  `image` tinyint DEFAULT '0',
  `all` tinyint DEFAULT '0',
  `createdAt` datetime DEFAULT NULL,
  `fk_userId` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `regenerateLog_user_idx` (`fk_userId`),
  CONSTRAINT `regenerateLog_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

-- Table: user
       Table: user
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `authType` varchar(6) NOT NULL,
  `socialId` varchar(100) DEFAULT NULL,
  `password` varchar(200) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `emailDuplicate` varchar(200) DEFAULT NULL,
  `grade` varchar(20) DEFAULT 'basic' COMMENT 'Membership tier: basic, pro, business, premium',
  `status` varchar(5) DEFAULT NULL,
  `lastLoginAt` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `membershipStartDate` datetime DEFAULT NULL COMMENT 'When current membership tier started',
  `membershipEndDate` datetime DEFAULT NULL COMMENT 'When current membership tier expires (NULL for basic/free)',
  `membershipStatus` enum('active','expired','cancelled') DEFAULT 'active' COMMENT 'Current membership status',
  `name` varchar(255) DEFAULT NULL,
  `sessionToken` varchar(255) DEFAULT NULL,
  `tokenUpdatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_membership` (`grade`,`membershipStatus`,`membershipEndDate`),
  KEY `idx_user_session_token` (`sessionToken`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

