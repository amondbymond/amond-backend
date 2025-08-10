# Database Schema Comparison Report: Local vs Production

## Summary
After comprehensive comparison of local and production database schemas, I found several differences that need to be addressed.

## Detailed Differences

### 1. Brand Table
**Missing columns in production:**
- `advantages` (TEXT) - Company advantages
- `coreProduct` (VARCHAR 500) - Core product/service name
- `coreProductDetail` (TEXT) - Core product detailed description
- `targetAudience` (VARCHAR 500) - Target audience
- `targetAudienceDetail` (TEXT) - Target audience detailed description  
- `mainColor` (VARCHAR 50) - Main theme color
- `selectedContentTypes` (JSON) - Selected content types for generation
- `brandAnalysis` (TEXT) - AI-generated brand analysis summary

### 2. Content Table
**Missing columns in production:**
- `snsEvent` (TINYINT(1)) - SNS event flag
- `imageSize` (VARCHAR 10) - Image size ratio
- `additionalText` (TEXT) - Individual image additional instructions

**Data type differences:**
- `imageLog`: production has VARCHAR(15), local has TEXT

### 3. ContentRequest Table
**Missing columns in production:**
- `mainColor` (VARCHAR 100) - Main color preference

**Data type differences:**
- `directionList`: production has VARCHAR(25), local has VARCHAR(500)

**Extra columns in production:**
- `status` (VARCHAR 20) - Not present in local (keeping it as it may be used)

### 4. Project Table
**Data type differences:**
- `lastAccessedAt`: production has TIMESTAMP, local has DATETIME

### 5. EmailNotification Table
**Structure differences:**
- Production missing several indexes and foreign key constraints that exist in local
- Column constraints differ (NOT NULL specifications)

### 6. Tables Differences
**Tables only in local:**
- `cleanup_log` - Used for tracking cleanup operations

**Tables only in production:**
- `migration_log` - Used for tracking migrations (keeping this)

### 7. Other Minor Differences
- Brand table: Different charset specifications (utf8mb4 vs utf8mb4_unicode_ci)
- User table: Column order differs but same columns exist

## Migration Script
The `comprehensive_migration.sql` script has been updated to address all these differences. It will:
1. Add all missing columns to brand, content, and contentRequest tables
2. Modify data types to match local schema
3. Add missing indexes and foreign key constraints
4. Create the cleanup_log table (optional)
5. Log the migration in the existing migration_log table

## Recommendation
Review the migration script carefully before running it on production. The script uses IF NOT EXISTS clauses to be safe for re-running if needed.