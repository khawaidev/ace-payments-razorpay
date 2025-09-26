const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

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
        // Verify the payment signature
        const isValidSignature = verifyPaymentSignature(orderId, paymentId, signature);
        
        if (!isValidSignature) {
            throw new Error('Invalid payment signature');
        }

        const planConfig = PLAN_CONFIGS[plan];
        if (!planConfig) {
            throw new Error(`Invalid plan: ${plan}`);
        }
        
        // In a real deployment, update subscription in DB here
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



