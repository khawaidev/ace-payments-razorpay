const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Initialize Supabase client (service role for admin operations)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

// Plan configurations aligned with Supabase pricing_plans
// Amounts are in paise (match aceai/supabase-setup.sql monthly price)
const PLAN_CONFIGS = {
    pro: {
        name: 'Pro',
        amount: 100,
        currency: 'INR',
        description: 'Most popular choice'
    },
    pro_plus: {
        name: 'Pro+',
        amount: 100,
        currency: 'INR',
        description: 'For advanced learners'
    },
    ultra: {
        name: 'Ultra',
        amount: 100,
        currency: 'INR',
        description: 'Power users with live tutor features'
    }
};

/**
 * Create a Razorpay order
 */
async function createRazorpayOrder(plan, userId, userEmail = '', userName = 'Ace User') {
    try {
        // Validate environment variables
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            throw new Error('Razorpay credentials not configured');
        }

        const planConfig = PLAN_CONFIGS[plan];
        if (!planConfig) {
            throw new Error(`Invalid plan: ${plan}`);
            }

        // Build a short receipt to satisfy Razorpay's 40-char limit
        const shortUserId = (userId || '').toString().slice(0, 10);
        const receipt = `ace_${plan}_${shortUserId}_${Date.now()}`.slice(0, 40);

        const options = {
            amount: planConfig.amount,
            currency: planConfig.currency,
            receipt,
            notes: {
                plan: plan,
                userId: userId,
                userEmail: userEmail,
                userName: userName
            }
        };

        const order = await razorpay.orders.create(options);
        
        return {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            status: order.status,
            plan: plan,
            planName: planConfig.name,
            planDescription: planConfig.description
        };
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        // Bubble up the most useful message (Razorpay SDK often nests it under error.error.description)
        const message = (error && (error.error && error.error.description)) || error?.message || 'Failed to create payment order';
        throw new Error(message);
    }
}

/**
 * Verify payment signature
 */
function verifyPaymentSignature(orderId, paymentId, signature) {
    try {
        if (!process.env.RAZORPAY_KEY_SECRET) {
            console.error('Razorpay secret key not configured');
            return false;
        }

        const body = orderId + '|' + paymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');
        
        return expectedSignature === signature;
    } catch (error) {
        console.error('Error verifying payment signature:', error);
        return false;
    }
}

/**
 * Record successful payment
 */
async function recordPaymentSuccess({ orderId, paymentId, signature, plan, userId }) {
    try {
        console.log('Starting payment verification:', { orderId, paymentId, plan, userId });
        
        // Validate required parameters
        if (!orderId || !paymentId || !signature || !plan || !userId) {
            throw new Error(`Missing required parameters: orderId=${!!orderId}, paymentId=${!!paymentId}, signature=${!!signature}, plan=${!!plan}, userId=${!!userId}`);
        }
        
        // Verify the payment signature
        const isValidSignature = verifyPaymentSignature(orderId, paymentId, signature);
        console.log('Signature verification result:', isValidSignature);
        
        if (!isValidSignature) {
            throw new Error('Invalid payment signature');
        }

        const planConfig = PLAN_CONFIGS[plan];
        if (!planConfig) {
            throw new Error(`Invalid plan: ${plan}`);
        }
        
        // Persist to Supabase if admin client is available
        if (supabaseAdmin) {
            try {
                // Update payment record to captured
                const { error: updatePaymentError } = await supabaseAdmin
                  .from('payments')
                  .update({
                    razorpay_payment_id: paymentId,
                    razorpay_signature: signature,
                    status: 'captured',
                    updated_at: new Date().toISOString()
                  })
                  .eq('razorpay_order_id', orderId)
                  .eq('user_id', userId);
                
                if (updatePaymentError) {
                    console.error('Supabase payment update error:', updatePaymentError);
                    throw new Error('Failed to update payment record');
                }

                // Upsert subscription (based on db.sql structure)
                const { error: subscriptionError } = await supabaseAdmin
                  .from('subscriptions')
                  .upsert({
                    user_id: userId,
                    plan_id: plan,
                    provider: 'razorpay',
                    status: 'active',
                    razorpay_payment_id: paymentId,
                    current_period_start: new Date().toISOString(),
                    current_period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
                  }, { onConflict: 'user_id', ignoreDuplicates: false });
                
                if (subscriptionError) {
                    console.error('Supabase subscription upsert error:', subscriptionError);
                    throw new Error('Failed to create/update subscription');
                }

                // Update user profile plan
                const { error: profileError } = await supabaseAdmin
                  .from('profiles')
                  .update({ plan })
                  .eq('id', userId);
                
                if (profileError) {
                    console.error('Supabase profile update error:', profileError);
                    throw new Error('Failed to update user profile');
                }

                console.log(`✅ Payment confirmed and subscription activated for user ${userId}, plan ${plan}`);
            } catch (dbError) {
                console.error('Database persistence error:', dbError);
                throw new Error(`Payment verification succeeded but database update failed: ${dbError.message}`);
            }
        } else {
            console.warn('⚠️  Supabase admin client not configured; skipping DB persistence');
        }
        
        return {
            success: true,
            orderId: orderId,
            paymentId: paymentId,
            plan: plan,
            planName: planConfig?.name || 'Unknown Plan',
            amount: planConfig?.amount || 0,
            currency: planConfig?.currency || 'INR',
            timestamp: new Date().toISOString(),
            userId: userId
        };
    } catch (error) {
        console.error('Error recording payment success:', error);
        throw new Error('Failed to record payment success');
    }
}

/**
 * Get plan details
 */
function getPlanDetails(plan) {
    return PLAN_CONFIGS[plan] || null;
}

/**
 * Get all available plans
 */
function getAllPlans() {
    return Object.keys(PLAN_CONFIGS).map(plan => ({
        id: plan,
        ...PLAN_CONFIGS[plan]
    }));
}

module.exports = {
    createRazorpayOrder,
    verifyPaymentSignature,
    recordPaymentSuccess,
    getPlanDetails,
    getAllPlans
};




