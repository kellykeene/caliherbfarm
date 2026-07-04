export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const email = formData.get('email')?.toString();
    const list = formData.get('form-name')?.toString() || 'newsletter';

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // In production, forward to your email service (Mailchimp, ConvertKit, etc.)
    // For now, log the subscription
    console.log(`Newsletter signup: ${email} → list: ${list}`);

    // Example: ConvertKit integration
    // const apiKey = import.meta.env.NEWSLETTER_API_KEY;
    // const formId = list === 'herb-bulletin' ? 'BULLETIN_FORM_ID' : 'GENERAL_FORM_ID';
    // await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ api_key: apiKey, email }),
    // });

    // Redirect back with success message
    const referer = request.headers.get('referer') || '/';
    return Response.redirect(`${referer}?subscribed=true`, 303);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Subscription failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
