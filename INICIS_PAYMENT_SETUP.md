# INICIS Payment System Implementation Guide

## Overview
This document provides setup instructions for the INICIS payment system implementation in the Amond backend.

## Files Created

### 1. Router Implementation
- **File**: `/router/payment.ts`
- **Description**: Contains all INICIS payment endpoints
- **Endpoints**:
  - `POST /payment/inicis/generate-hashes` - Generate SHA256 hashes for billing key requests
  - `POST /payment/inicis/issue-billing-key` - Issue billing key from INICIS (Step 3)
  - `POST /payment/inicis/save-billing-key` - Save billing keys after successful issuance
  - `POST /payment/inicis/billing-approval` - Process monthly billing using stored billing keys
  - `GET /payment/inicis/billing-keys` - Retrieve user's billing keys
  - `DELETE /payment/inicis/billing-keys/:id` - Deactivate billing keys
  - `GET /payment/inicis/payment-history` - Get payment transaction history

### 2. Database Schema
- **File**: `/create_payment_tables.sql`
- **Description**: SQL script to create necessary payment tables
- **Tables**:
  - `billing_keys` - Stores encrypted billing keys for recurring payments
  - `payment_logs` - Logs all payment transactions and responses
  - `payment_subscriptions` - Tracks user subscription plans and billing cycles

### 3. Router Registration
- **File**: `/app.ts` (modified)
- **Description**: Added payment router to the main Express app

## Environment Variables Required

Add the following environment variables to your `.env` file:

```env
# INICIS Test Environment (Billing)
INICIS_TEST_MID=INIBillTst
INICIS_TEST_SIGN_KEY=SU5JTElURV9UUklQTEVERVNfS0VZU1RS
INICIS_TEST_API_KEY=rKnPljRn5m6J9Mzz
INICIS_TEST_API_IV=W2KLNKra6Wxc1P==

# INICIS Production Environment
INICIS_PROD_MID=your_production_mid
INICIS_PROD_SIGN_KEY=your_production_sign_key
INICIS_PROD_API_KEY=your_production_api_key
INICIS_PROD_API_IV=your_production_api_iv

# Node Environment
NODE_ENV=development
```

## Database Setup

1. Run the database migration script:
```bash
cd /Users/taehyun/Downloads/Amond_new/backend
mysql -u root -p your_database_name < create_payment_tables.sql
```

## API Endpoint Documentation

### 1. Generate Payment Hashes
**Endpoint**: `POST /payment/inicis/generate-hashes`

**Request Body**:
```json
{
  "orderNumber": "ORDER_20240101_001",
  "timestamp": "1640995200000",
  "price": 10000,
  "buyerName": "김아몬드",
  "buyerTel": "010-1234-5678",
  "buyerEmail": "user@example.com",
  "goodName": "아몬드 프리미엄 플랜"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "mid": "INIBillTst",
    "oid": "ORDER_20240101_001",
    "price": 10000,
    "timestamp": "1640995200000",
    "signature": "generated_signature_hash",
    "verification": "generated_verification_hash",
    "buyerName": "김아몬드",
    "buyerTel": "010-1234-5678",
    "buyerEmail": "user@example.com",
    "goodName": "아몬드 프리미엄 플랜",
    "returnUrl": "http://localhost:3000/payment/billing-return",
    "closeUrl": "http://localhost:3000/payment/billing-close"
  }
}
```

### 2. Issue Billing Key (Step 3)
**Endpoint**: `POST /payment/inicis/issue-billing-key`

**Description**: Issues billing key from INICIS after authentication (Step 3 of INICIS billing process)

**Request Body**:
```json
{
  "authToken": "auth_token_from_inicis_auth_response",
  "authUrl": "https://stgstdpay.inicis.com/api/v1/billing/register",
  "orderNumber": "ORDER_20240101_001",
  "idc_name": "your_idc_center_code"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "billKey": "billing_key_from_inicis",
    "tid": "inicis_transaction_id",
    "applDate": "20240101",
    "applTime": "123456",
    "orderNumber": "ORDER_20240101_001",
    "cardNumber": "1234567890123456",
    "cardName": "신한카드"
  }
}
```

**Response (Failure)**:
```json
{
  "success": false,
  "message": "빌링키 발급에 실패했습니다.",
  "errorCode": "40",
  "details": {
    "resultCode": "40",
    "resultMsg": "실패 상세 메시지"
  }
}
```

### 3. Save Billing Key
**Endpoint**: `POST /payment/inicis/save-billing-key`
**Authentication**: Required (uses `isLogin` middleware)

**Request Body**:
```json
{
  "orderNumber": "ORDER_20240101_001",
  "billingKey": "billing_key_from_inicis",
  "cardNumber": "1234567890123456",
  "cardName": "신한카드"
}
```

**Response**:
```json
{
  "success": true,
  "message": "빌링키가 성공적으로 저장되었습니다.",
  "data": {
    "billingKeyId": 123
  }
}
```

### 4. Process Billing Approval
**Endpoint**: `POST /payment/inicis/billing-approval`
**Authentication**: Required (uses `isLogin` middleware)

**Request Body**:
```json
{
  "billingKey": "billing_key_from_database",
  "orderNumber": "ORDER_20240201_001",
  "price": 10000,
  "goodName": "아몬드 프리미엄 플랜 - 월간",
  "buyerName": "김아몬드",
  "buyerTel": "010-1234-5678",
  "buyerEmail": "user@example.com"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "결제가 성공적으로 완료되었습니다.",
  "data": {
    "orderNumber": "ORDER_20240201_001",
    "tid": "inicis_transaction_id",
    "price": 10000,
    "cardName": "신한카드",
    "cardNumber": "1234"
  }
}
```

**Response (Failure)**:
```json
{
  "success": false,
  "message": "결제에 실패했습니다.",
  "errorCode": "40"
}
```

## Security Features

1. **SHA256 Hash Generation**: All payment requests are secured with SHA256 hashes
2. **Card Number Masking**: Only last 4 digits of card numbers are stored
3. **User Authentication**: Billing operations require user login
4. **Billing Key Validation**: Each billing operation validates the user's ownership of the billing key
5. **Environment-based Configuration**: Separate test/production configurations

## Error Handling

The implementation includes comprehensive error handling for:
- Missing required parameters
- Invalid billing keys
- INICIS API communication errors
- Database operation failures
- Authentication failures

## Testing

### Test Environment
- Uses INICIS test server: `https://stgstdpay.inicis.com/api/v1/billing`
- Test MID: `INIBillTst` (for billing/subscription payments)
- Test Sign Key: `SU5JTElURV9UUklQTEVERVNfS0VZU1RS`
- Test API Key: `rKnPljRn5m6J9Mzz`
- Test API IV: `W2KLNKra6Wxc1P==`

### Production Environment
- Uses INICIS production server: `https://stdpay.inicis.com/api/v1/billing`
- Requires actual MID and Sign Key from INICIS

## Integration Notes

1. **Frontend Integration**: The frontend should call the generate-hashes endpoint first, then use the returned data to initialize the INICIS billing key request form.

2. **Billing Key Flow**:
   - Frontend calls `/payment/inicis/generate-hashes`
   - Frontend shows INICIS billing key authentication form
   - After successful authentication, INICIS returns authToken and authUrl
   - Frontend calls `/payment/inicis/issue-billing-key` with authToken, authUrl, orderNumber, and idc_name
   - Backend makes billing key issuance request to INICIS and returns the billing key
   - Frontend calls `/payment/inicis/save-billing-key` to store the billing key in database

3. **Monthly Billing**: Set up a cron job to automatically call `/payment/inicis/billing-approval` for active subscriptions.

## Dependencies

All required dependencies are already included in the existing package.json:
- `crypto` (Node.js built-in)
- `axios` (for INICIS API calls)
- `express` (web framework)

## Next Steps

1. Run the database migration script
2. Configure environment variables
3. Test the endpoints with Postman or similar tools
4. Integrate with the frontend payment flow
5. Set up monitoring and logging for production use