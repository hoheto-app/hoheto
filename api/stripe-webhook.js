// api/stripe-webhook.js
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl   = process.env.SUPABASE_URL || 'https://kxaqkwjeuozdxqltbxex.supabase.co';
  const supabaseKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || !webhookSecret || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(supabaseUrl, supabaseKey);

    // メールアドレスからSupabaseユーザーIDを取得する共通関数
    async function findUserIdByEmail(email) {
      if (!email) return null;
      const { data } = await db.auth.admin.listUsers();
      const user = (data?.users || []).find(u => u.email === email);
      return user ? user.id : null;
    }

    // 支払い成功 → is_premium = true
    if (event.type === 'checkout.session.completed' ||
        event.type === 'invoice.payment_succeeded') {
      const obj = event.data.object;
      const email = obj.customer_details?.email || obj.customer_email;
      const userId = await findUserIdByEmail(email);
      if (userId) {
        await db.from('profiles').update({ is_premium: true }).eq('id', userId);
        console.log('Premium activated for:', userId, email);
      }
    }

    // 解約・支払い失敗 → is_premium = false
    if (event.type === 'customer.subscription.deleted' ||
        event.type === 'invoice.payment_failed') {
      const customerId = event.data.object.customer;
      const customer = await stripe.customers.retrieve(customerId);
      const email = customer.email;
      const userId = await findUserIdByEmail(email);
      if (userId) {
        await db.from('profiles').update({ is_premium: false }).eq('id', userId);
        console.log('Premium deactivated for:', userId, email);
      }
    }

    return res.status(200).json({ received: true });

  } catch (e) {
    console.error('webhook error:', e);
    return res.status(500).json({ error: e.message });
  }
}
