import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tierSchema = z.object({
  price: z.number(),
  stripePriceId: z.string(),
  /** Shown as the price Description in the Stripe dashboard. */
  stripeNickname: z.string().optional(),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum([
      'whole-dried-herbs',
      'tea-blends',
      'fresh-herbs',
      'face-body',
      'tinctures-formulas',
      'tinctures-singles',
      'culinary',
      'csa',
    ]),
    price: z.number(),
    priceDisplay: z.string(),
    image: z.string(),
    sku: z.string(),
    inStock: z.boolean().default(true),
    variants: z
      .array(
        z.object({
          label: z.string(),
          price: z.number(),
          stripePriceId: z.string(),
          inStock: z.boolean().default(true),
          /** Shown as the price Description in the Stripe dashboard. */
          stripeNickname: z.string().optional(),
        }),
      )
      .optional(),
    isSubscription: z.boolean().default(false),
    subscriptionInterval: z.enum(['month', 'quarter', 'year']).optional(),
    slidingScale: z
      .object({
        low: tierSchema,
        middle: tierSchema,
        high: tierSchema,
      })
      .optional(),
    tags: z.array(z.string()).optional(),
    relatedProducts: z.array(z.string()).optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { products };
