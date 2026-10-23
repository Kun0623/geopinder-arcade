import { randomUUID } from 'node:crypto';

const STEPPAY_API_ORIGIN = 'https://api.steppay.kr';
const SUPPORT_AMOUNT = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class StepPayCheckoutError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'StepPayCheckoutError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function requiredEnv(env, key) {
  const value = typeof env?.[key] === 'string' ? env[key].trim() : '';
  if (!value || value.includes('YOUR_') || value.includes('REPLACE_')) {
    throw new StepPayCheckoutError('CONFIGURATION_ERROR', '후원 결제 준비가 아직 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
  return value;
}

function requireHttpsOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) throw new Error('invalid');
    return url.origin;
  } catch {
    throw new StepPayCheckoutError('ORIGIN_INVALID', '결제 페이지 주소를 확인할 수 없습니다.', 400);
  }
}

function returnUrl(origin, state, orderCode) {
  const url = new URL('/', origin);
  url.searchParams.set('support', state);
  url.searchParams.set('order', orderCode);
  return url.toString();
}

async function requestJson(fetchImpl, path, options) {
  let response;
  try {
    response = await fetchImpl(`${STEPPAY_API_ORIGIN}${path}`, options);
  } catch {
    throw new StepPayCheckoutError('PROVIDER_UNAVAILABLE', '결제 서비스를 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (!response.ok) {
    throw new StepPayCheckoutError('PROVIDER_REQUEST_FAILED', '결제 요청을 준비하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.');
  }

  try {
    return await response.json();
  } catch {
    throw new StepPayCheckoutError('PROVIDER_RESPONSE_INVALID', '결제 서비스의 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

function makeHeaders(secretToken) {
  return {
    'Secret-Token': secretToken,
    accept: 'application/json',
    'content-type': 'application/json'
  };
}

function makeCustomerUsername() {
  return `geopinder_${randomUUID().replaceAll('-', '')}`;
}

export function validateSupportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new StepPayCheckoutError('VALIDATION_ERROR', '후원 정보를 다시 입력해 주세요.', 400);
  }

  const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/gu, ' ') : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!name || name.length > 80 || !email || email.length > 254 || !EMAIL_PATTERN.test(email) || payload.consent !== true) {
    throw new StepPayCheckoutError('VALIDATION_ERROR', '이름, 올바른 이메일, 결제 정보 전송 동의를 확인해 주세요.', 400);
  }

  return { name, email };
}

export async function createCheckout({ name, email, origin, env, fetchImpl = fetch }) {
  const secretToken = requiredEnv(env, 'STEPPAY_SECRET_TOKEN');
  const productCode = requiredEnv(env, 'STEPPAY_PRODUCT_CODE');
  const priceCode = requiredEnv(env, 'STEPPAY_PRICE_CODE_5000');
  const safeOrigin = requireHttpsOrigin(origin);
  const headers = makeHeaders(secretToken);

  const customer = await requestJson(fetchImpl, '/api/v1/customers', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      username: makeCustomerUsername(),
      name,
      email,
      marketingEmail: false,
      marketingSms: false,
      marketingKakao: false
    })
  });
  const customerId = Number(customer?.id);
  if (!Number.isInteger(customerId) || customerId < 1) {
    throw new StepPayCheckoutError('CUSTOMER_RESPONSE_INVALID', '결제 고객 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const order = await requestJson(fetchImpl, '/api/v1/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId,
      currency: 'KRW',
      purchaseDeadline: new Date(Date.now() + (30 * 60 * 1000)).toISOString(),
      items: [{
        currency: 'KRW',
        minimumQuantity: 0,
        productCode,
        priceCode
      }]
    })
  });
  const orderCode = typeof order?.orderCode === 'string' ? order.orderCode.trim() : '';
  if (!/^order_[A-Za-z0-9]+$/u.test(orderCode)) {
    throw new StepPayCheckoutError('ORDER_RESPONSE_INVALID', '결제 주문 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const paymentUrl = new URL(`${STEPPAY_API_ORIGIN}/api/v1/orders/${encodeURIComponent(orderCode)}/pay`);
  paymentUrl.searchParams.set('successUrl', returnUrl(safeOrigin, 'success', orderCode));
  paymentUrl.searchParams.set('errorUrl', returnUrl(safeOrigin, 'error', orderCode));
  paymentUrl.searchParams.set('cancelUrl', returnUrl(safeOrigin, 'cancel', orderCode));
  paymentUrl.searchParams.set('lang', 'ko');

  let paymentResponse;
  try {
    paymentResponse = await fetchImpl(paymentUrl, { method: 'GET', headers: { 'Secret-Token': secretToken }, redirect: 'manual' });
  } catch {
    throw new StepPayCheckoutError('PROVIDER_UNAVAILABLE', '결제 페이지를 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  const checkoutUrl = paymentResponse?.headers?.get('location');
  let verifiedCheckoutUrl;
  try {
    verifiedCheckoutUrl = new URL(checkoutUrl);
  } catch {
    throw new StepPayCheckoutError('PAYMENT_LINK_INVALID', '안전한 결제 페이지 주소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (paymentResponse.status !== 302 || verifiedCheckoutUrl.protocol !== 'https:') {
    throw new StepPayCheckoutError('PAYMENT_LINK_INVALID', '안전한 결제 페이지 주소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  return { orderCode, checkoutUrl: verifiedCheckoutUrl.toString() };
}

export { SUPPORT_AMOUNT };
