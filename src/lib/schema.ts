import { SITE } from './constants';

export function getOrganizationSchema() {
  return {
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/logo.png`,
    description: SITE.description,
    email: SITE.email,
    sameAs: [SITE.social.instagram, SITE.social.bluesky],
  };
}

export function getWebSiteSchema() {
  return {
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
    },
  };
}

export function getLocalBusinessSchema() {
  return {
    '@type': 'LocalBusiness',
    '@id': `${SITE.url}/#business`,
    name: SITE.name,
    url: SITE.url,
    email: SITE.email,
    description: SITE.description,
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'CA',
      addressCountry: 'US',
    },
    sameAs: [SITE.social.instagram, SITE.social.bluesky],
  };
}

export function getBreadcrumbSchema(
  items: { name: string; url: string }[],
) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function getFaqSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function getProductSchema(product: {
  name: string;
  description: string;
  image: string;
  sku: string;
  lowPrice: number;
  highPrice: number;
  offerCount: number;
  inStock: boolean;
}) {
  return {
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku,
    brand: {
      '@type': 'Organization',
      name: SITE.name,
    },
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: product.lowPrice.toFixed(2),
      highPrice: product.highPrice.toFixed(2),
      priceCurrency: 'USD',
      offerCount: product.offerCount,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
}
