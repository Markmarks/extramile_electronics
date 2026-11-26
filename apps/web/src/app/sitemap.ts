import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/public';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/search`, changeFrequency: 'weekly', priority: 0.4 },
    ...['/track', '/returns', '/warranty', '/contact', '/privacy', '/terms'].map((p) => ({
      url: `${base}${p}`,
      changeFrequency: 'monthly' as const,
      priority: 0.2,
    })),
  ];

  try {
    const supabase = createPublicClient();
    const [productsRes, categoriesRes] = await Promise.all([
      supabase
        .from('products')
        .select('slug, updated_at')
        .eq('is_active', true)
        .returns<{ slug: string; updated_at: string }[]>(),
      supabase
        .from('categories')
        .select('slug')
        .eq('is_active', true)
        .returns<{ slug: string }[]>(),
    ]);

    const categoryRoutes: MetadataRoute.Sitemap = (categoriesRes.data ?? []).map((c) => ({
      url: `${base}/c/${c.slug}`,
      changeFrequency: 'daily',
      priority: 0.6,
    }));
    const productRoutes: MetadataRoute.Sitemap = (productsRes.data ?? []).map((p) => ({
      url: `${base}/p/${p.slug}`,
      lastModified: p.updated_at,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticRoutes, ...categoryRoutes, ...productRoutes];
  } catch {
    return staticRoutes;
  }
}
