// In-memory session token store (avoids localStorage/sessionStorage token persistence)
let memoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? 4 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    headers.set('X-Requested-With', 'XMLHttpRequest');
    if (memoryToken) {
      headers.set('Authorization', `Bearer ${memoryToken}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers,
        signal: options.signal || controller.signal,
      });
    } catch {
      clearTimeout(timer);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw new Error('Koneksi terputus sementara. Periksa jaringan lalu coba lagi.');
    }
    clearTimeout(timer);

    if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const rawMsg =
        data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : '';
      if (rawMsg && !rawMsg.trim().startsWith('{')) {
        throw new Error(rawMsg);
      }
      throw new Error(
        res.status >= 500
          ? 'Layanan sedang sibuk atau dimuat ulang. Silakan coba beberapa detik lagi.'
          : `Permintaan tidak dapat diproses (${res.status}).`
      );
    }
    return (data ?? {}) as T;
  }

  throw new Error('Koneksi terputus sementara. Silakan coba lagi.');
}

export async function verifyCookieSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/status', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data && data.currentUser);
  } catch {
    return false;
  }
}

export async function fetchProductAccessBlob(
  productId: string,
  download = false
): Promise<{ blobUrl: string; mime: string }> {
  const headers = new Headers({ 'X-Requested-With': 'XMLHttpRequest' });
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  const url = `/api/products/${encodeURIComponent(productId)}/access-file${download ? '?download=1' : ''}`;
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal memuat file akses produk.');
  }
  const blob = await res.blob();
  return { blobUrl: URL.createObjectURL(blob), mime: blob.type };
}

export function formatRupiah(amount: number): string {
  return `Rp ${Math.round(amount || 0).toLocaleString('id-ID')}`;
}

export function formatDateId(iso?: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatDateTimeId(iso?: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
