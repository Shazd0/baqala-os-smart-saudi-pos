/**
 * Product image lookup using the Open Food Facts API (free, no API key).
 * https://world.openfoodfacts.org
 */

export interface OFFProduct {
  found: true;
  nameEn: string;
  nameAr: string;
  imageUrl: string;
  brands: string;
}
export interface OFFNotFound { found: false }
export type OFFLookupResult = OFFProduct | OFFNotFound;

export interface OFFCandidate {
  nameEn: string;
  imageUrl: string;
  brands: string;
}

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'product_name,product_name_ar,image_front_url,image_url,brands,categories_tags';
const LOOKUP_TIMEOUT_MS = 4500;

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function lookupByBarcode(barcode: string): Promise<OFFLookupResult> {
  try {
    const res = await fetchWithTimeout(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`);
    if (!res.ok) return { found: false };
    const data = await res.json();
    if (data.status !== 1 || !data.product) return { found: false };
    const p = data.product;
    const imageUrl = p.image_front_url || p.image_url || '';
    if (!imageUrl) return { found: false };
    return {
      found: true,
      nameEn: p.product_name || p.brands || '',
      nameAr: p.product_name_ar || '',
      imageUrl,
      brands: p.brands || '',
    };
  } catch {
    return { found: false };
  }
}

export async function searchByName(term: string): Promise<OFFCandidate[]> {
  try {
    const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(term)}&json=1&page_size=9&action=process&fields=${FIELDS}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.products as any[]) || [])
      .filter(p => p.image_front_url || p.image_url)
      .slice(0, 9)
      .map(p => ({
        nameEn: p.product_name || p.brands || '',
        imageUrl: p.image_front_url || p.image_url || '',
        brands: p.brands || '',
      }));
  } catch {
    return [];
  }
}
