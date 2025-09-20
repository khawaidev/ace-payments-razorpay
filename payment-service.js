const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Plan configurations
const PLAN_CONFIGS = {
    starter: {
        name: 'Starter Plan',
        amount: 29900, // Amount in paise (₹299)
        currency: 'INR',
        description: 'Perfect for getting started with AI learning'
    },
    pro: {
        name: 'Pro Plan',
        amount: 59900, // Amount in paise (₹599)
        currency: 'INR',
        description: 'Advanced features for serious learners'
    },
    ultra: {
        name: 'Ultra Plan',
        amount: 99900, // Amount in paise (₹999)
        currency: 'INR',
        description: 'Complete access to all premium features'
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

        const options = {
            amount: planConfig.amount,
            currency: planConfig.currency,
            receipt: `aceai_${plan}_${userId}_${Date.now()}`,
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
        throw new Error('Failed to create payment order');
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

        // Here you would typically:
        // 1. Update user's subscription in your database
        // 2. Send confirmation email
        // 3. Log the transaction
        // 4. Update analytics
        
        // For now, we'll just return success
        const planConfig = PLAN_CONFIGS[plan];
        
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
