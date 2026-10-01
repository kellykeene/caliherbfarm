export const prerender = false;

import type { APIRoute } from 'astro';
import { STRIPE_WEBHOOK_SECRET } from 'astro:env/server';
import { getStripe } from '@/lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // Read at runtime via astro:env (see astro.config.mjs), so it is never baked
  // into the build and a variable added in Netlify takes effect without a rebuild.
  const webhookSecret = STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set — cannot verify webhooks.');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  try {
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Handle successful payment
        // In production: send confirmation email, update inventory, etc.
        console.log('Payment successful for session:', session.id);
        break;
      }
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        console.log('New subscription created:', subscription.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log('Subscription cancelled:', subscription.id);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Webhook verification failed';
    console.error('Webhook error:', message);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }
};
