# Database Schema Differences: Local vs Production

## Brand Table Differences

### Local Brand Table has these additional columns:
- `advantages` text COMMENT 'Company advantages'
- `coreProduct` varchar(500) COMMENT 'Core product/service name'
- `targetAudience` varchar(500) COMMENT 'Target audience'
- `mainColor` varchar(50) COMMENT 'Main theme color'
- `selectedContentTypes` json COMMENT 'Selected content types for generation'

### From the error, these are also missing in production:
- `coreProductDetail`
- `targetAudienceDetail`
- `brandAnalysis`

## Tables Present:
### Local only:
- cleanup_log

### Production only:
- migration_log

## Need to check other tables for column differences...