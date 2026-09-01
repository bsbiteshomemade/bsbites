BS BITES - RAZORPAY PAYMENT SETUP
===================================

This version replaces the old direct UPI deep-link with Razorpay Standard Checkout.
The website now creates a server-side Razorpay order, opens secure checkout, verifies
the Razorpay signature on the server, and only then marks the order as paid / sends
the WhatsApp confirmation.

FILES
-----
BS_Bites_Order_Website_Razorpay.html  Website
server.js                              Secure payment backend
package.json                           Node.js dependencies
.env.example                           Environment variable template

IMPORTANT
---------
Do NOT put RAZORPAY_KEY_SECRET inside the HTML. It must stay on the server.

SETUP
-----
1. Create / activate your Razorpay merchant account and complete the business/KYC
   requirements required for live payments.
2. In Razorpay Dashboard, create API keys. Start with Test Mode.
3. Copy .env.example to .env and set:
   RAZORPAY_KEY_ID=...
   RAZORPAY_KEY_SECRET=...
   GOOGLE_SCRIPT_URL=... (optional; leave blank if not using the existing sheet logger)
4. Install Node.js, then run:
   npm install
   npm start
5. Open the site through the Node server, not by double-clicking the HTML file:
   http://localhost:3000/BS_Bites_Order_Website_Razorpay.html
6. Test a payment in Razorpay Test Mode.
7. After testing, switch to Live Mode and use the Live API keys.
8. Deploy both the HTML and server.js together on a host that supports Node.js.

WHY THIS FIXES THE OLD FLOW
----------------------------
The previous website directly opened a UPI URI (upi://pay) and then treated a return
to the page as a confirmation. A static HTML page cannot independently verify that
the bank/UPI transaction really succeeded.

The new flow is:
Cart -> server creates Razorpay order -> Razorpay Checkout -> customer pays ->
Razorpay returns payment details -> server verifies signature -> payment confirmed ->
order logged -> WhatsApp confirmation.

NOTES
-----
- The payment gateway can still decline individual transactions for bank/risk/security
  reasons. No website can guarantee that every bank transaction will succeed.
- The new flow gives customers a proper checkout and lets them retry with another
  available payment method instead of relying on a direct UPI URI.
- Product prices are validated on the server, so a customer cannot simply edit the
  browser code to change the amount charged.
- The current product catalogue in server.js matches the uploaded website:
  Milk Chocolate ₹199
  Almond Crunch ₹249
  Kaju Makhana Royal Crunch ₹299

Razorpay documentation:
https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
