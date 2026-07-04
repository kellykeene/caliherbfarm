export const prerender = false;

import type { APIRoute } from 'astro';
import { getStripe } from '@/lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { items, isSubscription } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripe = getStripe();
    const siteUrl = import.meta.env.SITE_URL || 'http://localhost:4321';

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: items.map(
        (item: { stripePriceId: string; quantity: number }) => ({
          price: item.stripePriceId,
          quantity: item.quantity,
        }),
      ),
      success_url: `${siteUrl}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart`,
      ...(isSubscription
        ? {}
        : {
            shipping_address_collection: { allowed_countries: ['US'] },
          }),
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
