const base = () => process.env.PI_API_BASE_URL || 'https://api.minepi.com/v2';
async function call(path, { method = 'GET', token, apiKey, body } = {}) {
  const headers = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (apiKey) headers.authorization = `Key ${apiKey}`;
  const r = await fetch(`${base()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || `Pi API error ${r.status}`), { status: 502, piStatus: r.status });
  return data;
}
export const verifyPiUser = token => call('/me', { token });
export const getPayment = id => call(`/payments/${encodeURIComponent(id)}`, { apiKey: process.env.PI_API_KEY });
export const approvePayment = id => call(`/payments/${encodeURIComponent(id)}/approve`, { method: 'POST', apiKey: process.env.PI_API_KEY });
export const completePayment = (id, txid) => call(`/payments/${encodeURIComponent(id)}/complete`, { method: 'POST', apiKey: process.env.PI_API_KEY, body: { txid } });
