# AWS SES (Simple Email Service) Setup Guide

## Quick Setup Steps

### 1. Access AWS SES Console
Go to: https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2

### 2. Verify Your Email Domain
1. In SES Console, go to **Configuration > Verified identities**
2. Click **Create identity**
3. Choose **Domain**
4. Enter: `mond.io.kr`
5. Follow the DNS verification steps (you'll need to add records to your domain)

**OR** for quick testing, verify a single email:
1. Choose **Email address** instead
2. Enter: `service@mond.io.kr`
3. Check your email and click the verification link

### 3. Request Production Access (Important!)
By default, SES is in "sandbox mode" and can only send to verified emails.

1. Go to **Account dashboard**
2. Click **Request production access**
3. Fill out the form:
   - Use case: Transactional
   - Website URL: https://amond.kr
   - Description: "Send notification emails when AI-generated content is ready"
   - Expected volume: 100-500 emails/month

### 4. Get AWS Credentials
If you don't already have programmatic access keys:

1. Go to IAM: https://console.aws.amazon.com/iam/
2. Click **Users** > **Add users**
3. User name: `amond-ses-user`
4. Select **Access key - Programmatic access**
5. Attach policy: **AmazonSESFullAccess**
6. Save the Access Key ID and Secret Access Key

### 5. Add to .env file
```env
# AWS Credentials (if not already set)
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=ap-northeast-2

# SES specific
SES_FROM_EMAIL=service@mond.io.kr
```

### 6. Test Your Setup
```bash
# Restart your backend
npm start

# The system will now use AWS SES for sending emails
```

## Troubleshooting

### "Email address not verified" error
- Make sure you've verified `service@mond.io.kr` in SES
- Check you're in the correct region (ap-northeast-2)

### "Sandbox mode" limitations
- In sandbox, you can only send TO verified emails
- Request production access to send to any email

### Rate limits
- Sandbox: 1 email/second, 200 emails/day
- Production: Starts at 50,000 emails/day

## Benefits of AWS SES
- Very cheap: $0.10 per 1,000 emails
- High deliverability
- Integrates well with your existing AWS services
- Works perfectly with EC2 (free tier includes 62,000 emails/month from EC2)