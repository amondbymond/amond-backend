-- 빌링키 저장 테이블
CREATE TABLE IF NOT EXISTS `billing_keys` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fk_userId` INT NOT NULL,
  `orderNumber` VARCHAR(100) NOT NULL,
  `billingKey` VARCHAR(255) NOT NULL COMMENT 'INICIS TID used as billing key',
  `cardNumber` VARCHAR(20) NOT NULL COMMENT 'Masked card number',
  `cardName` VARCHAR(50) NOT NULL COMMENT 'Card company name',
  `status` ENUM('active', 'inactive') DEFAULT 'active',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_userId` (`fk_userId`),
  KEY `idx_billingKey` (`billingKey`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_billing_keys_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='사용자 빌링키 정보';

-- 구독 정보 테이블
CREATE TABLE IF NOT EXISTS `payment_subscriptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fk_userId` INT NOT NULL,
  `planType` VARCHAR(20) NOT NULL COMMENT 'basic, pro, business, premium',
  `status` ENUM('active', 'suspended', 'cancelled', 'expired') DEFAULT 'active',
  `startDate` DATE NOT NULL,
  `nextBillingDate` DATE NOT NULL,
  `price` INT NOT NULL COMMENT 'Monthly price in KRW',
  `billingCycle` ENUM('monthly', 'yearly') DEFAULT 'monthly',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_userId` (`fk_userId`),
  KEY `idx_status` (`status`),
  KEY `idx_nextBillingDate` (`nextBillingDate`),
  CONSTRAINT `fk_subscriptions_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='구독 정보';

-- 결제 로그 테이블
CREATE TABLE IF NOT EXISTS `payment_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fk_userId` INT NOT NULL,
  `orderNumber` VARCHAR(100) NOT NULL,
  `billingKey` VARCHAR(255) DEFAULT NULL,
  `price` INT NOT NULL,
  `goodName` VARCHAR(200) NOT NULL,
  `buyerName` VARCHAR(100) NOT NULL,
  `buyerTel` VARCHAR(20) NOT NULL,
  `buyerEmail` VARCHAR(100) NOT NULL,
  `paymentStatus` ENUM('success', 'failed', 'cancelled', 'refunded') NOT NULL,
  `inicisResponse` JSON DEFAULT NULL COMMENT 'Full INICIS response',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_userId` (`fk_userId`),
  KEY `idx_orderNumber` (`orderNumber`),
  KEY `idx_paymentStatus` (`paymentStatus`),
  KEY `idx_createdAt` (`createdAt`),
  CONSTRAINT `fk_payment_logs_user` FOREIGN KEY (`fk_userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='결제 내역';