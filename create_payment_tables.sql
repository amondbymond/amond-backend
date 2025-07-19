-- Create payment-related tables for INICIS billing system

-- 1. Create billing_keys table for storing user billing keys
CREATE TABLE IF NOT EXISTS billing_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fk_userId INT NOT NULL,
  orderNumber VARCHAR(100) NOT NULL,
  billingKey VARCHAR(200) NOT NULL,
  cardNumber VARCHAR(20) NOT NULL COMMENT 'Last 4 digits only for security',
  cardName VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive') DEFAULT 'active',
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NULL,
  INDEX idx_user_id (fk_userId),
  INDEX idx_billing_key (billingKey),
  INDEX idx_status (status),
  CONSTRAINT fk_billing_keys_user FOREIGN KEY (fk_userId) REFERENCES user(id) ON DELETE CASCADE
);

-- 2. Create payment_logs table for storing payment transaction history
CREATE TABLE IF NOT EXISTS payment_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fk_userId INT NOT NULL,
  orderNumber VARCHAR(100) NOT NULL,
  billingKey VARCHAR(200) NOT NULL,
  price INT NOT NULL,
  goodName VARCHAR(200) NOT NULL,
  buyerName VARCHAR(100) NOT NULL,
  buyerTel VARCHAR(20) NOT NULL,
  buyerEmail VARCHAR(100) NOT NULL,
  paymentStatus ENUM('success', 'failed', 'cancelled') NOT NULL,
  inicisResponse TEXT COMMENT 'Store raw INICIS response for debugging',
  createdAt DATETIME NOT NULL,
  INDEX idx_user_id (fk_userId),
  INDEX idx_order_number (orderNumber),
  INDEX idx_payment_status (paymentStatus),
  INDEX idx_created_at (createdAt),
  CONSTRAINT fk_payment_logs_user FOREIGN KEY (fk_userId) REFERENCES user(id) ON DELETE CASCADE
);

-- 3. Create payment_subscriptions table for tracking user subscription status
CREATE TABLE IF NOT EXISTS payment_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fk_userId INT NOT NULL,
  planType VARCHAR(50) NOT NULL DEFAULT 'premium',
  status ENUM('active', 'cancelled', 'expired') DEFAULT 'active',
  startDate DATETIME NOT NULL,
  nextBillingDate DATETIME NOT NULL,
  price INT NOT NULL,
  billingCycle VARCHAR(20) DEFAULT 'monthly',
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NULL,
  INDEX idx_user_id (fk_userId),
  INDEX idx_status (status),
  INDEX idx_next_billing (nextBillingDate),
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (fk_userId) REFERENCES user(id) ON DELETE CASCADE
);

-- Add comments to describe the tables
ALTER TABLE billing_keys COMMENT = 'Stores INICIS billing keys for recurring payments';
ALTER TABLE payment_logs COMMENT = 'Logs all payment transactions and their results';
ALTER TABLE payment_subscriptions COMMENT = 'Tracks user subscription plans and billing cycles';