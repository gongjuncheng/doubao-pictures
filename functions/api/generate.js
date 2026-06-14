export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const params = await request.json();
  const AK = env.VOLC_ACCESS_KEY;
  const SK = env.VOLC_SECRET_KEY;

  if (!AK || !SK) {
    return new Response(JSON.stringify({ error: '未配置密钥' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const reqBody = {
    req_key: 'high_aes_general_v30l_zt2i',
    prompt: params.prompt,
    seed: params.seed ?? -1,
    scale: params.scale ?? 2.5,
    width: params.width ?? 1328,
    height: params.height ?? 1328,
    return_url: true,
    logo_info: {
      add_logo: params.add_logo ?? false,
      position: 0,
      language: 0,
      opacity: 1,
      logo_text_content: params.logo_text ?? '',
    },
  };
  if (!reqBody.logo_info.logo_text_content) reqBody.logo_info.add_logo = false;

  const bodyJson = JSON.stringify(reqBody);
  const host = 'visual.volcengineapi.com';
  const action = 'CVProcess';
  const version = '2022-08-31';
  const fullUrl = `https://${host}?Action=${action}&Version=${version}`;

  // 签名函数（与之前相同）
  const method = 'POST';
  const service = 'cv';
  const region = 'cn-north-1';
  const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = date.slice(0, 8);

  async function sha256Hex(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function hmacSha256(key, message) {
    const encoder = new TextEncoder();
    const keyData = typeof key === 'string' ? encoder.encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    return new Uint8Array(signature);
  }
  async function hmacSha256Hex(key, message) {
    const signature = await hmacSha256(key, message);
    return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `host:${host}\nx-date:${date}\n`;
  const signedHeaders = 'host;x-date';
  const payloadHash = await sha256Hex(bodyJson);
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const algorithm = 'HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/request`;
  const stringToSign = `${algorithm}\n${date}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
  const signingKey = await hmacSha256(`HMAC${SK}`, dateStamp);
  const signKeyRegion = await hmacSha256(signingKey, region);
  const signKeyService = await hmacSha256(signKeyRegion, service);
  const signKeyRequest = await hmacSha256(signKeyService, 'request');
  const signature = await hmacSha256Hex(signKeyRequest, stringToSign);
  const authorization = `${algorithm} Credential=${AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'X-Date': date,
      'Authorization': authorization,
    },
    body: bodyJson,
  });
  const result = await resp.json();
  if (resp.status === 200 && result.code === 10000) {
    const imgUrl = result.data?.image_urls?.[0];
    if (imgUrl) return new Response(JSON.stringify({ image_url: imgUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
    return new Response(JSON.stringify({ error: '没有图片 URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: result.message || 'API 调用失败' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
    }
