export const PRODUCT_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80';

export const isHttpsImageUrl = (value) => {
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

export const getProductImage = (product) => {
  const candidates = [product?.image, product?.imageUrl, product?.imageURL];
  return candidates.find(isHttpsImageUrl)?.trim() || PRODUCT_IMAGE_FALLBACK;
};

export const setProductImageFallback = (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = PRODUCT_IMAGE_FALLBACK;
};
