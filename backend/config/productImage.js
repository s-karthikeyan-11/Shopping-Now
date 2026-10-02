const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80';

const CATEGORY_FALLBACK_IMAGES = Object.freeze({
  apparel: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
  cosmetics: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=80',
  electronics: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
  footwear: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  home: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
  mobiles: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80',
});

const isHttpsImageUrl = (value) => {
  if (typeof value !== 'string') return false;
  const urlValue = value.trim();
  if ((urlValue.match(/https?:\/\//gi) || []).length !== 1) return false;

  try {
    const url = new URL(urlValue);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const getDefaultProductImage = (category) =>
  CATEGORY_FALLBACK_IMAGES[String(category || '').trim().toLowerCase()] || DEFAULT_PRODUCT_IMAGE;

const normalizeProductImage = (value, category) => {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    return getDefaultProductImage(category);
  }
  if (!isHttpsImageUrl(value)) {
    throw new Error('Image URL must be one valid HTTPS URL');
  }
  return value.trim();
};

module.exports = {
  DEFAULT_PRODUCT_IMAGE,
  getDefaultProductImage,
  isHttpsImageUrl,
  normalizeProductImage,
};
