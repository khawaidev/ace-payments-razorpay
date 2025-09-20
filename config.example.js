// Example configuration file
// Copy this to config.js and fill in your actual values
// Or set these as environment variables in Render

module.exports = {
    // Razorpay Configuration
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID || 'your_razorpay_key_id_here',
        keySecret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret_here'
    },
    
    // Server Configuration
    server: {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'production'
    },
    
    // App Configuration
    app: {
        name: process.env.APP_NAME || 'Ace AI',
        url: process.env.APP_URL || 'https://aceai.app'
    }
};
