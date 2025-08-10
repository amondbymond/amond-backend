# Professional Email Service Setup

Since Gmail requires app passwords and has limitations, here are professional email services you can use:

## Option 1: SendGrid (Recommended for beginners)
**Free tier: 100 emails/day**

1. Sign up at https://sendgrid.com
2. Verify your sender email address
3. Get API key from Settings > API Keys
4. Install: `npm install @sendgrid/mail`
5. Update imports in `router/content.ts` and `cron/imageRetry.ts`:
   ```typescript
   import { checkAndSendNotifications } from "../module/emailNotificationSendGrid";
   ```
6. Add to `.env`:
   ```env
   SENDGRID_API_KEY=your-api-key
   SENDGRID_FROM_EMAIL=service@mond.io.kr
   ```

## Option 2: AWS SES (Best for production)
**Free tier: 62,000 emails/month (if sending from EC2)**

1. Set up AWS account
2. Verify domain or email in SES console
3. Get out of sandbox mode (for production)
4. Already installed (uses existing AWS SDK)
5. Update imports in `router/content.ts` and `cron/imageRetry.ts`:
   ```typescript
   import { checkAndSendNotifications } from "../module/emailNotificationSES";
   ```
6. Add to `.env`:
   ```env
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   AWS_REGION=ap-northeast-2
   SES_FROM_EMAIL=service@mond.io.kr
   ```

## Option 3: Resend (Newest, developer-friendly)
**Free tier: 3,000 emails/month**

1. Sign up at https://resend.com
2. Add and verify your domain
3. Get API key
4. Install: `npm install resend`
5. Update imports in `router/content.ts` and `cron/imageRetry.ts`:
   ```typescript
   import { checkAndSendNotifications } from "../module/emailNotificationResend";
   ```
6. Add to `.env`:
   ```env
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   RESEND_FROM_EMAIL=Amond <service@mond.io.kr>
   ```

## Option 4: Mailgun
**Free tier: 5,000 emails for 3 months**

Similar setup to SendGrid.

## Quick Start (SendGrid)

```bash
# 1. Install SendGrid
cd amond-backend
npm install @sendgrid/mail

# 2. Update your imports in these files:
# - router/content.ts (line 18)
# - cron/imageRetry.ts (line 4)
# Change from:
# import { checkAndSendNotifications } from "../module/emailNotification";
# To:
# import { checkAndSendNotifications } from "../module/emailNotificationSendGrid";

# 3. Add to .env
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=service@mond.io.kr

# 4. Restart backend
npm start
```

## Testing Without Email
If you just want to test without setting up email, leave the email settings empty in `.env`. The system will log "이메일 설정이 없어 이메일 전송을 건너뜁니다" and continue.