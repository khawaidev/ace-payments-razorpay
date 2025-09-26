const express = require('express');
const path = require('path');
const cors = require('cors');
const { createRazorpayOrder, recordPaymentSuccess } = require('./payment-service');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase admin client (service role)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Routes
app.get('/', (req, res) => {
    // Read the HTML file and inject environment variables
    const fs = require('fs');
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    
    // Inject Razorpay key
    html = html.replace('window.RAZORPAY_KEY_ID', `'${process.env.RAZORPAY_KEY_ID}'`);
    
    res.send(html);
});

app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'success.html'));
});

// Support Razorpay callback_url POST (redirect:true) by converting POST body to query params
app.post('/success', async (req, res) => {
    try {
        const paymentId = req.body.razorpay_payment_id || '';
        const orderId = req.body.razorpay_order_id || '';
        const signature = req.body.razorpay_signature || '';
        const plan = req.body.plan || req.query.plan || '';
        const userId = req.body.userId || req.query.userId || '';

        // Verify and persist (same as /api/verify-payment)
        const result = await recordPaymentSuccess({
            orderId,
            paymentId,
            signature,
            plan,
            userId
        });

        if (supabaseAdmin) {
            // Update payment
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
            }

            // Upsert subscription
            const { error: subscriptionError } = await supabaseAdmin
              .from('subscriptions')
              .upsert({
                user_id: userId,
                plan_id: plan,
                status: 'active',
                razorpay_payment_id: paymentId,
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
              }, { onConflict: 'user_id', ignoreDuplicates: false });
            if (subscriptionError) {
              console.error('Supabase subscription upsert error:', subscriptionError);
            }

            // Update profile plan
            const { error: profileError } = await supabaseAdmin
              .from('profiles')
              .update({ plan })
              .eq('id', userId);
            if (profileError) {
              console.error('Supabase profile update error:', profileError);
            }
        }

        const q = new URLSearchParams({ paymentId, orderId, signature, plan }).toString();
        return res.redirect(`/success?${q}`);
    } catch (err) {
        console.error('POST /success verification error:', err);
        return res.status(500).send('Payment verification failed.');
    }
});

// Create payment order
app.post('/api/create-order', async (req, res) => {
    try {
        // Validate environment variables
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ error: 'Payment service not configured' });
        }

        const { plan, userId, userEmail, userName } = req.body;
        
        if (!plan || !userId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const order = await createRazorpayOrder(plan, userId, userEmail, userName);

        // Persist pending payment record so verification can update it later
        if (supabaseAdmin) {
            try {
                const amount = typeof order.amount === 'number' ? order.amount : parseInt(order.amount, 10);
                await supabaseAdmin
                  .from('payments')
                  .insert({
                    user_id: userId,
                    provider: 'razorpay',
                    razorpay_order_id: order.id,
                    amount: isNaN(amount) ? null : amount,
                    currency: order.currency || 'INR',
                    status: 'pending',
                    plan_id: plan,
                    metadata: {
                      planName: order.planName,
                      planDescription: order.planDescription,
                    }
                  });
            } catch (dbErr) {
                console.error('Supabase insert pending payment error:', dbErr);
            }
        }

        res.json(order);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: error.message || 'Failed to create payment order' });
    }
});

// Verify payment
app.post('/api/verify-payment', async (req, res) => {
    try {
        // Validate environment variables
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ error: 'Payment service not configured' });
        }

        const { orderId, paymentId, signature, plan, userId } = req.body;
        
        if (!orderId || !paymentId || !signature || !plan || !userId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const result = await recordPaymentSuccess({
            orderId,
            paymentId,
            signature,
            plan,
            userId
        });
        
        // Persist to Supabase (mark payment captured, upsert subscription, update profile)
        if (!supabaseAdmin) {
            console.warn('Supabase admin client not configured; skipping DB update');
        } else {
            // Update payment
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
            }

            // Upsert subscription
            const { error: subscriptionError } = await supabaseAdmin
              .from('subscriptions')
              .upsert({
                user_id: userId,
                plan_id: plan,
                status: 'active',
                razorpay_payment_id: paymentId,
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
              }, { onConflict: 'user_id', ignoreDuplicates: false });
            if (subscriptionError) {
              console.error('Supabase subscription upsert error:', subscriptionError);
            }

            // Update profile plan
            const { error: profileError } = await supabaseAdmin
              .from('profiles')
              .update({ plan })
              .eq('id', userId);
            if (profileError) {
              console.error('Supabase profile update error:', profileError);
            }
        }

        res.json({ success: true, result });
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: error.message || 'Payment verification failed' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Validate environment variables on startup
function validateEnvironment() {
    const requiredVars = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.error('❌ Missing required environment variables:');
        missingVars.forEach(varName => {
            console.error(`   - ${varName}`);
        });
        console.error('\nPlease set these variables in your Render dashboard or .env file');
        process.exit(1);
    }
    
    console.log('✅ Environment variables validated');
    console.log(`🔑 Razorpay Key ID: ${process.env.RAZORPAY_KEY_ID.substring(0, 8)}...`);
    console.log(`🔐 Razorpay Secret: ${process.env.RAZORPAY_KEY_SECRET.substring(0, 8)}...`);
    if (!supabaseAdmin) {
      console.warn('⚠️  SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set; payments may remain pending in DB');
    }
}

// Start server
app.listen(PORT, () => {
    validateEnvironment();
    console.log(`🚀 Payment server running on port ${PORT}`);
    console.log(`🌐 Access the payment page at: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

