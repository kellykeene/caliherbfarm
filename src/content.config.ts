import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum([
      'tinctures-formulas',
      'tinctures-singles',
      'teas',
      'topicals',
      'culinary',
      'csa',
      'fresh-herbs',
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
        }),
      )
      .optional(),
    isSubscription: z.boolean().default(false),
    subscriptionInterval: z.enum(['month', 'quarter', 'year']).optional(),
    slidingScale: z
      .object({
        low: z.object({ price: z.number(), stripePriceId: z.string() }),
        middle: z.object({ price: z.number(), stripePriceId: z.string() }),
        high: z.object({ price: z.number(), stripePriceId: z.string() }),
      })
      .optional(),
    tags: z.array(z.string()).optional(),
    relatedProducts: z.array(z.string()).optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { products };
