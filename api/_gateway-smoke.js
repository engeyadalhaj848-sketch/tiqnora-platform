export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'not_found' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '';
  if (String(process.env.AI_GATEWAY_ENABLED || '').toLowerCase() !== 'true' || !token) {
    return res.status(503).json({
      ok: false,
      gateway_enabled: String(process.env.AI_GATEWAY_ENABLED || '').toLowerCase() === 'true',
      oidc_available: Boolean(process.env.VERCEL_OIDC_TOKEN),
      error: 'gateway_runtime_auth_unavailable'
    });
  }

  const model = process.env.AI_GATEWAY_MODEL || 'openai/gpt-5.6-luna';
  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Vercel-AI-App-Name': 'Tiqnora Gateway Smoke Test',
      'X-Vercel-AI-App-Url': 'https://tiqnora.com'
    },
    body: JSON.stringify({
      model,
      max_tokens: 32,
      temperature: 0,
      messages: [{ role: 'user', content: 'Reply exactly with TIQNORA_GATEWAY_OK' }]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({
      ok: false,
      model,
      status: response.status,
      error: payload?.error?.message || payload?.message || 'gateway_request_failed'
    });
  }

  const text = String(payload?.choices?.[0]?.message?.content || '').trim();
  return res.status(200).json({
    ok: text.includes('TIQNORA_GATEWAY_OK'),
    model: payload?.model || model,
    text
  });
}
