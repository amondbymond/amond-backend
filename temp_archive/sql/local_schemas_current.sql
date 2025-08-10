
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `aiPrompt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `aiPrompt` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(20) DEFAULT NULL,
  `prompt` varchar(3000) DEFAULT NULL,
  `required` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `billing_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='사용자 빌링키 정보';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `brand`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `brand` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `url` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `fk_userId` int DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `advantages` text COLLATE utf8mb4_unicode_ci COMMENT 'Company advantages',
  `coreProduct` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Core product/service name',
  `targetAudience` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Target audience',
  `mainColor` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Main theme color',
  `selectedContentTypes` json DEFAULT NULL COMMENT 'Selected content types for generation',
  PRIMARY KEY (`id`),
  KEY `idx_user` (`fk_userId`),
  CONSTRAINT `brand_ibfk_1` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cleanup_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cleanup_log` (
  `action` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `count` int DEFAULT NULL,
  `executed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `imageLog` text,
  `fk_contentRequestId` int NOT NULL,
  `direction` varchar(50) DEFAULT '정보형',
  `snsEvent` tinyint(1) DEFAULT '0' COMMENT 'SNS event flag',
  `imageSize` varchar(10) DEFAULT '1:1' COMMENT 'Image size ratio',
  `additionalText` text COMMENT 'Individual image additional instructions',
  PRIMARY KEY (`id`),
  KEY `content_ contentRequest_idx` (`fk_contentRequestId`),
  CONSTRAINT `content_ contentRequest` FOREIGN KEY (`fk_contentRequestId`) REFERENCES `contentRequest` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=541 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contentRequest`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `directionList` varchar(500) DEFAULT NULL,
  `mainColor` varchar(100) DEFAULT NULL,
  `searchResult` varchar(800) DEFAULT NULL,
  `searchToken` smallint DEFAULT NULL,
  `subjectToken` smallint DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `fk_projectId` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contentRequest_project_idx` (`fk_projectId`),
  CONSTRAINT `contentRequest_project` FOREIGN KEY (`fk_projectId`) REFERENCES `project` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=93 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `emailNotification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `emailNotification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fk_userId` int NOT NULL,
  `fk_contentRequestId` int NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','sent','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `createdAt` datetime NOT NULL,
  `sentAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status_contentRequestId` (`status`,`fk_contentRequestId`),
  KEY `fk_userId` (`fk_userId`),
  KEY `fk_contentRequestId` (`fk_contentRequestId`),
  KEY `idx_pending_notifications` (`fk_contentRequestId`,`status`),
  CONSTRAINT `emailNotification_ibfk_1` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `emailNotification_ibfk_2` FOREIGN KEY (`fk_contentRequestId`) REFERENCES `contentRequest` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `membership_tiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Reference table for membership tier definitions';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='결제 내역';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='구독 정보';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `fk_userId` int DEFAULT NULL,
  `fk_brandId` int DEFAULT NULL,
  `lastAccessedAt` datetime DEFAULT NULL,
  `isActive` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `project_user_idx` (`fk_userId`),
  KEY `idx_brand` (`fk_brandId`),
  CONSTRAINT `project_ibfk_1` FOREIGN KEY (`fk_brandId`) REFERENCES `brand` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `regenerateLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `authType` varchar(6) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
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
  `sessionToken` varchar(255) DEFAULT NULL,
  `tokenUpdatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_membership` (`grade`,`membershipStatus`,`membershipEndDate`),
  KEY `idx_user_session_token` (`sessionToken`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

