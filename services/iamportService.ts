import axios from 'axios';
import { queryAsync } from '../module/commonFunction';
import dotenv from 'dotenv';
dotenv.config();

// Iamport configuration
const IAMPORT_CONFIG = {
  apiKey: process.env.IAMPORT_API_KEY || 'your_api_key',
  apiSecret: process.env.IAMPORT_API_SECRET || 'your_api_secret',
  baseUrl: 'https://api.iamport.kr'
};

// Cache for access token
let accessToken: string | null = null;
let tokenExpiry: Date | null = null;

/**
 * Get Iamport access token
 */
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (accessToken && tokenExpiry && tokenExpiry > new Date()) {
    return accessToken;
  }

  try {
    const response = await axios.post(`${IAMPORT_CONFIG.baseUrl}/users/getToken`, {
      imp_key: IAMPORT_CONFIG.apiKey,
      imp_secret: IAMPORT_CONFIG.apiSecret
    });

    if (response.data.code === 0) {
      accessToken = response.data.response.access_token;
      // Token expires in 30 minutes, we'll refresh after 25 minutes
      tokenExpiry = new Date(Date.now() + 25 * 60 * 1000);
      return accessToken;
    } else {
      throw new Error(`Failed to get Iamport token: ${response.data.message}`);
    }
  } catch (error) {
    console.error('[Iamport] Error getting access token:', error);
    throw error;
  }
}

/**
 * Register billing key using card information
 */
export async function registerBillingKey({
  customerId,
  cardNumber,
  expiry,
  birth,
  pwd2digit,
  customerName,
  customerEmail
}: {
  customerId: string;
  cardNumber: string;
  expiry: string; // YYYY-MM format
  birth: string; // YYMMDD format
  pwd2digit: string;
  customerName?: string;
  customerEmail?: string;
}): Promise<{ success: boolean; billingKey?: string; error?: string }> {
  try {
    const token = await getAccessToken();

    // Clean card number (remove spaces and dashes)
    const cleanCardNumber = cardNumber.replace(/[\s-]/g, '');

    const response = await axios.post(
      `${IAMPORT_CONFIG.baseUrl}/subscribe/customers/${customerId}`,
      {
        card_number: cleanCardNumber,
        expiry: expiry,
        birth: birth,
        pwd_2digit: pwd2digit,
        customer_name: customerName,
        customer_email: customerEmail,
        pg: 'inicis' // Use INICIS as payment gateway
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.code === 0) {
      return {
        success: true,
        billingKey: customerId // Iamport uses customer_uid as billing key
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Failed to register billing key'
      };
    }
  } catch (error) {
    console.error('[Iamport] Error registering billing key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Make a payment using billing key
 */
export async function chargeWithBillingKey({
  customerId,
  merchantUid,
  amount,
  name,
  buyerName,
  buyerEmail,
  buyerTel
}: {
  customerId: string;
  merchantUid: string;
  amount: number;
  name: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerTel?: string;
}): Promise<{ success: boolean; impUid?: string; merchantUid?: string; error?: string }> {
  try {
    const token = await getAccessToken();

    const response = await axios.post(
      `${IAMPORT_CONFIG.baseUrl}/subscribe/payments/again`,
      {
        customer_uid: customerId,
        merchant_uid: merchantUid,
        amount: amount,
        name: name,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_tel: buyerTel
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.code === 0) {
      const payment = response.data.response;
      return {
        success: true,
        impUid: payment.imp_uid,
        merchantUid: payment.merchant_uid
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Payment failed'
      };
    }
  } catch (error) {
    console.error('[Iamport] Error charging with billing key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process monthly billing for all active subscriptions
 */
export async function processIamportMonthlyBilling() {
  console.log('[Iamport Billing] Starting monthly billing process...');
  
  try {
    // Get subscriptions due for billing
    const activeSubs = await queryAsync(`
      SELECT 
        ps.*,
        bk.billingKey,
        bk.cardNumber,
        bk.cardName,
        u.email,
        u.name
      FROM payment_subscriptions ps
      JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      JOIN user u ON ps.fk_userId = u.id
      WHERE ps.status = 'active'
        AND ps.nextBillingDate <= NOW()
        AND ps.planType != 'basic'
      ORDER BY ps.nextBillingDate ASC
      LIMIT 10
    `);

    console.log(`[Iamport Billing] Found ${activeSubs.length} subscriptions due for billing`);

    for (const subscription of activeSubs) {
      await processIamportSingleBilling(subscription);
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[Iamport Billing] Monthly billing process completed');
  } catch (error) {
    console.error('[Iamport Billing] Error in processMonthlyBilling:', error);
  }
}

/**
 * Process single subscription billing
 */
async function processIamportSingleBilling(subscription: any) {
  const merchantUid = `AMOND_${Date.now()}_${subscription.fk_userId}`;
  
  try {
    console.log(`[Iamport Billing] Processing payment for user ${subscription.fk_userId}, plan: ${subscription.planType}`);

    // Plan prices
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };

    const price = planPrices[subscription.planType] || subscription.price;
    const goodName = `Amond ${subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)} 멤버십`;

    // Use Iamport to charge
    const result = await chargeWithBillingKey({
      customerId: subscription.billingKey,
      merchantUid: merchantUid,
      amount: price,
      name: goodName,
      buyerName: subscription.name || subscription.email?.split('@')[0] || '구매자',
      buyerEmail: subscription.email || 'customer@mond.io.kr',
      buyerTel: '01000000000'
    });

    // Save payment log
    await queryAsync(`
      INSERT INTO payment_logs (
        fk_userId,
        orderNumber,
        billingKey,
        price,
        goodName,
        buyerName,
        buyerTel,
        buyerEmail,
        paymentStatus,
        inicisResponse,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      subscription.fk_userId,
      merchantUid,
      subscription.billingKey,
      price,
      goodName,
      subscription.name || subscription.email?.split('@')[0] || '구매자',
      '01000000000',
      subscription.email || 'customer@mond.io.kr',
      result.success ? 'success' : 'failed',
      JSON.stringify(result)
    ]);

    if (result.success) {
      console.log(`[Iamport Billing] SUCCESS - User ${subscription.fk_userId} charged ${price} KRW`);
      console.log(`[Iamport Billing] IMP UID: ${result.impUid}`);
      
      // Update next billing date
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      
      await queryAsync(`
        UPDATE payment_subscriptions 
        SET nextBillingDate = ?,
            updatedAt = NOW()
        WHERE id = ?
      `, [nextBillingDate, subscription.id]);

      // Update membership end date
      await queryAsync(`
        UPDATE user 
        SET membershipEndDate = ?
        WHERE id = ?
      `, [nextBillingDate, subscription.fk_userId]);

      console.log(`[Iamport Billing] Updated next billing date for user ${subscription.fk_userId}`);
    } else {
      // Payment failed
      console.error(`[Iamport Billing] FAILED - User ${subscription.fk_userId}: ${result.error}`);
      
      // Check failure count
      const failCount = await queryAsync(`
        SELECT COUNT(*) as count 
        FROM payment_logs 
        WHERE fk_userId = ? 
          AND paymentStatus = 'failed' 
          AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)
      `, [subscription.fk_userId]);

      if (failCount[0].count >= 3) {
        await queryAsync(`
          UPDATE payment_subscriptions 
          SET status = 'suspended',
              updatedAt = NOW()
          WHERE id = ?
        `, [subscription.id]);
        
        await queryAsync(`
          UPDATE user 
          SET membershipStatus = 'expired' 
          WHERE id = ?
        `, [subscription.fk_userId]);
        
        console.log(`[Iamport Billing] Subscription suspended for user ${subscription.fk_userId} after 3 failures`);
      }
    }
  } catch (error) {
    console.error(`[Iamport Billing] Error processing payment for user ${subscription.fk_userId}:`, error);
  }
}

/**
 * Delete billing key
 */
export async function deleteBillingKey(customerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getAccessToken();

    const response = await axios.delete(
      `${IAMPORT_CONFIG.baseUrl}/subscribe/customers/${customerId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.data.code === 0) {
      return { success: true };
    } else {
      return {
        success: false,
        error: response.data.message || 'Failed to delete billing key'
      };
    }
  } catch (error) {
    console.error('[Iamport] Error deleting billing key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Register billing key and make initial payment
 */
export async function registerAndCharge({
  customerId,
  cardNumber,
  expiry,
  birth,
  pwd2digit,
  merchantUid,
  amount,
  name,
  customerName,
  customerEmail
}: {
  customerId: string;
  cardNumber: string;
  expiry: string;
  birth: string;
  pwd2digit: string;
  merchantUid: string;
  amount: number;
  name: string;
  customerName?: string;
  customerEmail?: string;
}): Promise<{ success: boolean; impUid?: string; billingKey?: string; error?: string }> {
  try {
    const token = await getAccessToken();

    // Clean card number
    const cleanCardNumber = cardNumber.replace(/[\s-]/g, '');

    const response = await axios.post(
      `${IAMPORT_CONFIG.baseUrl}/subscribe/payments/onetime`,
      {
        merchant_uid: merchantUid,
        amount: amount,
        card_number: cleanCardNumber,
        expiry: expiry,
        birth: birth,
        pwd_2digit: pwd2digit,
        customer_uid: customerId, // This will create billing key
        name: name,
        buyer_name: customerName,
        buyer_email: customerEmail,
        buyer_tel: '01000000000',
        pg: 'inicis'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.code === 0) {
      const payment = response.data.response;
      return {
        success: true,
        impUid: payment.imp_uid,
        billingKey: customerId
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Payment failed'
      };
    }
  } catch (error) {
    console.error('[Iamport] Error in registerAndCharge:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}