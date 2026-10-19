import { createHash } from 'node:crypto';

export function username(value) {
  const name = String(value ?? '').normalize('NFKC').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.'-]{1,23}$/u.test(name))
    throw new Error('Choose a name of 2–24 letters, numbers, spaces, or simple punctuation.');
  return name;
}

/** Only the desktop main process calls Gumroad. No seller token is needed. */
export async function verifyLicense(key, productId, fetcher = fetch) {
  if (typeof key !== 'string' || key.trim().length < 12 || key.length > 200)
    throw new Error('Enter the license key your host gave you.');
  let response, result;
  try {
    response = await fetcher('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        product_id: productId,
        license_key: key.trim(),
        // Validation is idempotent; network retries must not consume activations.
        increment_uses_count: 'false',
      }),
      signal: AbortSignal.timeout(15000),
    });
    result = await response.json();
  } catch {
    throw new Error('Could not reach Gumroad. Connect to the internet and try activation again.');
  }
  if (response.status === 429 || response.status >= 500)
    throw new Error('Gumroad is busy. Please try activation again in a moment.');
  const p = result?.purchase;
  if (!response.ok || result.success !== true || !p || p.product_id !== productId)
    throw new Error('That key is not valid for this Ponyhaven invitation. Check it with your host.');
  if (p.refunded || p.chargebacked || p.license_disabled || (p.disputed && !p.dispute_won) ||
      p.subscription_ended_at || p.subscription_failed_at)
    throw new Error('This invitation is no longer active. Please contact your host.');
  return {
    productId,
    activatedAt: Date.now(),
    fingerprint: createHash('sha256').update(productId + ':' + key.trim()).digest('hex'),
  };
}
