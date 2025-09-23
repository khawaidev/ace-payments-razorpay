const express = require('express');
const path = require('path');
const cors = require('cors');
const { createRazorpayOrder, recordPaymentSuccess } = require('./payment-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
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
}

// Start server
app.listen(PORT, () => {
    validateEnvironment();
    console.log(`🚀 Payment server running on port ${PORT}`);
    console.log(`🌐 Access the payment page at: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

