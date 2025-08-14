# Amond Backend

Express.js-based backend API for Amond - AI-powered social media content generator.

## Prerequisites

- Node.js v20+
- MySQL 8.0+
- AWS Account (S3 access)
- Redis (optional, for sessions)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=amond

# Server
PORT=9988

# JWT
JWT_SECRET=your_jwt_secret

# AWS S3
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-northeast-2

# INICIS Payment
INICIS_TEST_MID=INIBillTst
INICIS_TEST_SIGN_KEY=SU5JTElURV9UUklQTEVERVNfS0VZU1RS

# AI Services
OPENAI_API_KEY=your_openai_key
```

4. Setup database:
```bash
mysql -u root -p
CREATE DATABASE amond;
USE amond;
# Run SQL scripts from sql/ directory
```

## Development

```bash
npm run dev
```

The API runs at http://localhost:9988

## Production

```bash
npm run build
npm start
```

## Deployment

Deploy via GitHub Actions when pushed to main branch.

Production URL: https://api.mond.io.kr

## API Structure

```
router/
├── auth.ts         # Authentication endpoints
├── content.ts      # Content generation
├── payment.ts      # Payment processing
├── admin.ts        # Admin endpoints
└── user.ts         # User management
```

## Key Services

- Content generation using OpenAI
- Image generation with DALL-E
- Payment processing with INICIS
- S3 for image storage
- MySQL for data persistence

## Notes

- Uses TypeScript
- Session-based authentication
- One-time payment system (30-day access)
- Automatic image compression and optimization