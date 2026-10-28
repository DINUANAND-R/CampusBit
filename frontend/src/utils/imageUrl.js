const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * Resolves any listing image (object or string, absolute or relative)
 * into a safe, full URL for browser rendering.
 */
export function getImageUrl(image) {
  if (!image) return null;
  const raw = typeof image === 'string' ? image : image.url;
  if (!raw || typeof raw !== 'string') return null;

  // If already absolute URL (http, https, blob:, data:)
  if (/^(https?:|\/\/|blob:|data:)/i.test(raw)) {
    return raw;
  }

  // Relative upload path: prepend backend base URL
  if (raw.startsWith('/')) {
    return `${BACKEND_BASE}${raw}`;
  }

  return `${BACKEND_BASE}/${raw}`;
}

export const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80';
