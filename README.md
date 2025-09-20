# Ace AI Payment Server

This is the web-based payment server for the Ace AI app, hosted on Render. It provides a seamless payment experience using Razorpay with UPI integration.

## Features

- 🚀 **Web-based Payment Interface**: Clean, responsive payment page
- 💳 **Razorpay Integration**: Secure payment processing
- 📱 **UPI Support**: Shows available UPI apps for easy payment
- 🔄 **Deep Linking**: Returns users to the app after payment
- ✅ **Success/Failure Pages**: Clear feedback for payment status
- 🎨 **Modern UI**: Beautiful, user-friendly interface

## Deployment on Render

### 1. Prerequisites

- Render account (free tier available)
- Razorpay account with API keys
- Node.js 16+ (Render supports this)

### 2. Environment Variables

Set these in your Render dashboard under "Environment":

**Required Variables:**
```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret_key_here
```

**Optional Variables:**
```
PORT=3000
NODE_ENV=production
APP_NAME=Ace AI
APP_URL=https://your-app-domain.com
```

**How to get Razorpay keys:**
1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to Settings → API Keys
3. Generate API Keys (Test mode for development, Live mode for production)
4. Copy the Key ID and Key Secret

### 3. Deploy Steps

1. **Connect Repository**:
   - Go to Render dashboard
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Select the `aceai/web-payment` folder

2. **Configure Build**:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: 16

3. **Set Environment Variables**:
   - Go to "Environment" tab
   - Add `RAZORPAY_KEY_ID` with your Razorpay Key ID
   - Add `RAZORPAY_KEY_SECRET` with your Razorpay Secret Key
   - Optionally set `PORT=3000` and other variables

4. **Deploy**:
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your service URL (e.g., `https://aceai-payment.onrender.com`)

### 4. Update App Configuration

Update the payment URL in your app:

```typescript
// In aceai/app/razorpay.tsx
const webPaymentUrl = `https://your-service-name.onrender.com/?plan=${plan}&orderId=${order.id}&amount=${order.amount}&currency=${order.currency}&email=${encodeURIComponent(user.email || '')}&name=${encodeURIComponent(user.profile?.full_name || user.profile?.username || 'Ace User')}`;
```

## Local Development

1. **Install Dependencies**:
   ```bash
   cd aceai/web-payment
   npm install
   ```

2. **Set Environment Variables**:
   ```bash
   export RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
   export RAZORPAY_KEY_SECRET=your_razorpay_secret_key_here
   export PORT=3000
   export NODE_ENV=development
   ```

3. **Run Server**:
   ```bash
   npm start
   # or for development
   npm run dev
   ```

4. **Test Payment**:
   - Visit `http://localhost:3000`
   - Add URL parameters: `?plan=starter&orderId=test&amount=29900&currency=INR&email=test@example.com&name=Test User`

## API Endpoints

### GET /
Payment page with Razorpay integration

**Query Parameters**:
- `plan`: Plan type (starter, pro, ultra)
- `orderId`: Razorpay order ID
- `amount`: Amount in paise
- `currency`: Currency code (default: INR)
- `email`: User email
- `name`: User name

### GET /success
Payment success page with return to app functionality

### POST /api/create-order
Create a new Razorpay order

**Body**:
```json
{
  "plan": "starter",
  "userId": "user123",
  "userEmail": "user@example.com",
  "userName": "John Doe"
}
```

### POST /api/verify-payment
Verify payment signature and record success

**Body**:
```json
{
  "orderId": "order_123",
  "paymentId": "pay_123",
  "signature": "signature_123",
  "plan": "starter",
  "userId": "user123"
}
```

## Deep Linking

The app uses deep linking to return users after payment:

- **App Scheme**: `aceai://payment-success`
- **Web Fallback**: `https://aceai.app/payment-success`

## Security

- Payment signatures are verified using Razorpay's secret key
- All sensitive data is handled server-side
- HTTPS is enforced in production
- CORS is configured for app domains only

## Monitoring

- Health check endpoint: `/api/health`
- Error logging to console
- Payment success/failure tracking

## Support

For issues or questions:
1. Check Render logs in dashboard
2. Verify Razorpay credentials
3. Test with Razorpay test mode first
4. Check deep linking configuration in app

## License

Part of the Ace AI project.
