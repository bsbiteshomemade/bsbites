const express = require("express");
const crypto = require("crypto");
const path = require("path");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express();
app.use(express.json({limit:"100kb"}));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || "";

const PRODUCTS = {
  "Milk Chocolate": 199,
  "Almond Crunch": 249,
  "Kaju Makhana Royal Crunch": 299
};

if(!KEY_ID || !KEY_SECRET){
  console.warn("Razorpay keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
}
const razorpay = KEY_ID && KEY_SECRET ? new Razorpay({key_id:KEY_ID,key_secret:KEY_SECRET}) : null;

function cleanPhone(value){
  return String(value || "").replace(/\D/g, "");
}
function calculateCart(cart){
  if(!Array.isArray(cart) || !cart.length) throw new Error("Cart is empty.");
  let total = 0;
  const normalized = [];
  for(const item of cart){
    const name = String(item.name || "");
    const qty = Number(item.qty);
    if(!PRODUCTS[name] || !Number.isInteger(qty) || qty < 1 || qty > 50){
      throw new Error("Invalid product or quantity.");
    }
    total += PRODUCTS[name] * qty;
    normalized.push({name, qty, price: PRODUCTS[name]});
  }
  return {total, normalized};
}

app.get("/api/config", (req,res)=>{
  res.json({keyId: KEY_ID || ""});
});

app.post("/api/create-order", async (req,res)=>{
  try{
    if(!razorpay) return res.status(503).json({error:"Online payment is not configured yet."});
    const {total, normalized} = calculateCart(req.body.cart);
    const customer = req.body.customer || {};
    const name = String(customer.name || "").trim();
    const phone = cleanPhone(customer.phone);
    const address = String(customer.address || "").trim();
    if(!name || !/^\d{10}$/.test(phone) || !address){
      return res.status(400).json({error:"Please provide a valid name, 10-digit phone number and delivery address."});
    }

    const order = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: `BSB-${Date.now()}`,
      notes: {
        customer_name: name.slice(0,255),
        customer_phone: phone,
        products: normalized.map(x=>`${x.name} x ${x.qty}`).join(", ").slice(0,255)
      }
    });
    res.json({orderId: order.id, amount: order.amount, currency: order.currency});
  }catch(err){
    console.error("create-order", err);
    res.status(400).json({error: err.message || "Could not create payment order."});
  }
});

app.post("/api/verify-payment", async (req,res)=>{
  try{
    if(!razorpay) return res.status(503).json({verified:false,error:"Online payment is not configured yet."});
    const {razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;
    if(!razorpay_order_id || !razorpay_payment_id || !razorpay_signature){
      return res.status(400).json({verified:false,error:"Missing payment verification data."});
    }

    const expected = crypto.createHmac("sha256", KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if(expected !== razorpay_signature){
      return res.status(400).json({verified:false,error:"Payment signature verification failed."});
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if(payment.order_id !== razorpay_order_id || !["captured","authorized"].includes(payment.status)){
      return res.status(400).json({verified:false,error:"Payment is not in a valid state."});
    }

    // Record only verified payments. Google Apps Script is optional.
    if(GOOGLE_SCRIPT_URL){
      const customer = req.body.customer || {};
      const {normalized} = calculateCart(req.body.cart);
      const payload = {
        name: String(customer.name || "").trim(),
        phone: cleanPhone(customer.phone),
        address: String(customer.address || "").trim(),
        products: normalized.map(x=>`${x.name} x ${x.qty} = ₹${x.price*x.qty}`).join(", "),
        quantity: normalized.reduce((s,x)=>s+x.qty,0),
        total: payment.amount / 100,
        paymentStatus: "Razorpay - Verified",
        paymentId: razorpay_payment_id
      };
      try{
        await fetch(GOOGLE_SCRIPT_URL,{
          method:"POST",
          headers:{"Content-Type":"text/plain;charset=utf-8"},
          body:JSON.stringify(payload)
        });
      }catch(sheetErr){
        console.error("Google Sheets logging failed", sheetErr);
        // Payment remains verified even if the optional sheet logger is unavailable.
      }
    }

    res.json({verified:true, paymentId:razorpay_payment_id});
  }catch(err){
    console.error("verify-payment", err);
    res.status(500).json({verified:false,error:"Could not verify the payment."});
  }
});

app.get("/health", (req,res)=>res.json({ok:true}));

app.listen(PORT, ()=>console.log(`BS Bites running on port ${PORT}`));
