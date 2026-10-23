import { createCheckout, StepPayCheckoutError, validateSupportPayload } from '../../lib/steppay-checkout.mjs';

const WINDOW_MS = 10 * 60 * 1000;
const REQUEST_LIMIT = 5;
const requestBuckets = new Map();

export const config = {
  api: { bodyParser: { sizeLimit: '16kb' } }
};

function headerValue(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()] ?? headers?.[name.toUpperCase()];
  return Array.isArray(value) ? value[0] : value;
}

function requestOrigin(req) {
  const forwardedHost = headerValue(req.headers, 'x-forwarded-host');
  const host = String(forwardedHost || headerValue(req.headers, 'host') || '').split(',')[0].trim();
  const forwardedProtocol = String(headerValue(req.headers, 'x-forwarded-proto') || 'https').split(',')[0].trim().toLowerCase();
  if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(host)) return null;
  return `${forwardedProtocol === 'http' ? 'http' : 'https'}://${host}`;
}

function requestIp(req) {
  return String(headerValue(req.headers, 'x-forwarded-for') || 'unknown').split(',')[0].trim() || 'unknown';
}

function defaultRateLimit(ip, now = Date.now()) {
  const existing = requestBuckets.get(ip);
  const bucket = !existing || now - existing.startedAt >= WINDOW_MS
    ? { startedAt: now, count: 0 }
    : existing;
  bucket.count += 1;
  requestBuckets.set(ip, bucket);

  if (requestBuckets.size > 1000) {
    for (const [key, value] of requestBuckets) {
      if (now - value.startedAt >= WINDOW_MS) requestBuckets.delete(key);
    }
  }
  return bucket.count <= REQUEST_LIMIT;
}

function response(res, statusCode, body) {
  res.status(statusCode).json(body);
}

function parseBody(req) {
  const body = req.body;
  if (Buffer.isBuffer(body)) {
    if (body.length > 16 * 1024) throw new StepPayCheckoutError('BODY_TOO_LARGE', '요청 크기가 너무 큽니다.', 413);
    return JSON.parse(body.toString('utf8'));
  }
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > 16 * 1024) throw new StepPayCheckoutError('BODY_TOO_LARGE', '요청 크기가 너무 큽니다.', 413);
    return JSON.parse(body);
  }
  return body;
}

export function createCheckoutHandler({ env = process.env, fetchImpl = fetch, rateLimit = defaultRateLimit } = {}) {
  return async function checkoutHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return response(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 사용할 수 있습니다.' });
    }

    const siteOrigin = requestOrigin(req);
    const origin = String(headerValue(req.headers, 'origin') || '').replace(/\/$/u, '');
    if (!siteOrigin || !origin || origin !== siteOrigin) {
      return response(res, 403, { error: 'ORIGIN_FORBIDDEN', message: '같은 사이트에서만 후원 결제를 시작할 수 있습니다.' });
    }

    const contentType = String(headerValue(req.headers, 'content-type') || '');
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return response(res, 415, { error: 'UNSUPPORTED_MEDIA_TYPE', message: 'JSON 요청만 사용할 수 있습니다.' });
    }

    let payload;
    try {
      payload = validateSupportPayload(parseBody(req));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return response(res, 400, { error: 'INVALID_JSON', message: '후원 정보를 다시 입력해 주세요.' });
      }
      if (error instanceof StepPayCheckoutError) {
        return response(res, error.statusCode, { error: error.code, message: error.message });
      }
      return response(res, 400, { error: 'VALIDATION_ERROR', message: '후원 정보를 다시 입력해 주세요.' });
    }

    if (!rateLimit(requestIp(req))) {
      return response(res, 429, { error: 'RATE_LIMITED', message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
    }

    try {
      const checkout = await createCheckout({ ...payload, origin: siteOrigin, env, fetchImpl });
      return response(res, 200, checkout);
    } catch (error) {
      if (error instanceof StepPayCheckoutError) {
        return response(res, error.statusCode, { error: error.code, message: error.message });
      }
      console.error('[steppay-checkout] unexpected provider error');
      return response(res, 502, { error: 'CHECKOUT_UNAVAILABLE', message: '결제 페이지를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  };
}

export default createCheckoutHandler();
