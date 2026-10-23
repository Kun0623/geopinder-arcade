import assert from 'node:assert/strict';
import { createCheckout, validateSupportPayload, StepPayCheckoutError } from '../lib/steppay-checkout.mjs';
import { createCheckoutHandler } from '../api/steppay/checkout.mjs';

const ENV = Object.freeze({
  STEPPAY_SECRET_TOKEN: 'test-secret-token',
  STEPPAY_PRODUCT_CODE: 'product_djPARUBvi',
  STEPPAY_PRICE_CODE_5000: 'price_YXTnNZysK'
});

const ORIGIN = 'https://geopinder-arcade.vercel.app';

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

function makeStepPayFetch({ paymentUrl = 'https://pay.steppay.kr/orders/order_Demo123', customerStatus = 201 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const request = { url: String(url), method: options.method || 'GET', headers: options.headers || {}, body: options.body || null };
    calls.push(request);

    if (request.url === 'https://api.steppay.kr/api/v1/customers') {
      return jsonResponse(customerStatus, { id: 73, code: 'customer_demo_73' });
    }
    if (request.url === 'https://api.steppay.kr/api/v1/orders') {
      return jsonResponse(201, { orderCode: 'order_Demo123' });
    }
    if (request.url.startsWith('https://api.steppay.kr/api/v1/orders/order_Demo123/pay?')) {
      return new Response(null, { status: 302, headers: { location: paymentUrl } });
    }
    throw new Error(`Unexpected StepPay request: ${request.url}`);
  };
  return { fetchImpl, calls };
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  };
}

async function testValidCheckoutFlow() {
  const { fetchImpl, calls } = makeStepPayFetch();
  const checkout = await createCheckout({
    name: '테스트 후원자',
    email: 'supporter@example.com',
    origin: ORIGIN,
    env: ENV,
    fetchImpl
  });

  assert.deepEqual(checkout, {
    orderCode: 'order_Demo123',
    checkoutUrl: 'https://pay.steppay.kr/orders/order_Demo123'
  });
  assert.equal(calls.length, 3, '고객 생성, 주문 생성, 결제 링크 발급을 순서대로 호출해야 합니다.');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Secret-Token'], ENV.STEPPAY_SECRET_TOKEN);
  const customer = JSON.parse(calls[0].body);
  assert.equal(customer.name, '테스트 후원자');
  assert.equal(customer.email, 'supporter@example.com');
  assert.equal(customer.marketingEmail, false);
  assert.match(customer.username, /^geopinder_[a-z0-9]{32}$/);

  const order = JSON.parse(calls[1].body);
  assert.equal(order.customerId, 73);
  assert.equal(order.currency, 'KRW');
  assert.equal(order.items[0].productCode, ENV.STEPPAY_PRODUCT_CODE);
  assert.equal(order.items[0].priceCode, ENV.STEPPAY_PRICE_CODE_5000);
  assert.equal(order.items[0].currency, 'KRW');
  assert.equal(order.items[0].minimumQuantity, 0);

  const paymentUrl = new URL(calls[2].url);
  assert.equal(paymentUrl.searchParams.get('lang'), 'ko');
  assert.equal(paymentUrl.searchParams.get('successUrl'), `${ORIGIN}/?support=success&order=order_Demo123`);
  assert.equal(paymentUrl.searchParams.get('errorUrl'), `${ORIGIN}/?support=error&order=order_Demo123`);
  assert.equal(paymentUrl.searchParams.get('cancelUrl'), `${ORIGIN}/?support=cancel&order=order_Demo123`);
}

async function testRejectsMissingConfigAndUnsafeUrl() {
  const { fetchImpl } = makeStepPayFetch();
  await assert.rejects(
    () => createCheckout({ name: '테스트', email: 'test@example.com', origin: ORIGIN, env: {}, fetchImpl }),
    (error) => error instanceof StepPayCheckoutError && error.code === 'CONFIGURATION_ERROR'
  );

  const badLink = makeStepPayFetch({ paymentUrl: 'http://pay.steppay.kr/not-secure' });
  await assert.rejects(
    () => createCheckout({ name: '테스트', email: 'test@example.com', origin: ORIGIN, env: ENV, fetchImpl: badLink.fetchImpl }),
    (error) => error instanceof StepPayCheckoutError && error.code === 'PAYMENT_LINK_INVALID'
  );
}

function testPayloadValidation() {
  assert.deepEqual(
    validateSupportPayload({ name: '  홍길동 ', email: 'SUPPORTER@EXAMPLE.COM', consent: true }),
    { name: '홍길동', email: 'supporter@example.com' }
  );
  for (const body of [
    { name: '', email: 'supporter@example.com', consent: true },
    { name: '홍길동', email: 'bad-email', consent: true },
    { name: '홍길동', email: 'supporter@example.com', consent: false }
  ]) {
    assert.throws(() => validateSupportPayload(body), (error) => error instanceof StepPayCheckoutError && error.code === 'VALIDATION_ERROR');
  }
}

async function testHandlerGuardsBeforeProviderCall() {
  let providerCalls = 0;
  const handler = createCheckoutHandler({
    env: ENV,
    fetchImpl: async () => { providerCalls += 1; throw new Error('Provider must not be called'); },
    rateLimit: () => true
  });

  const crossOriginResponse = makeResponse();
  await handler({
    method: 'POST',
    headers: { host: 'geopinder-arcade.vercel.app', 'x-forwarded-proto': 'https', origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: { name: '홍길동', email: 'supporter@example.com', consent: true }
  }, crossOriginResponse);
  assert.equal(crossOriginResponse.statusCode, 403);
  assert.equal(providerCalls, 0);

  const badInputResponse = makeResponse();
  await handler({
    method: 'POST',
    headers: { host: 'geopinder-arcade.vercel.app', 'x-forwarded-proto': 'https', origin: ORIGIN, 'content-type': 'application/json' },
    body: { name: '', email: 'supporter@example.com', consent: true }
  }, badInputResponse);
  assert.equal(badInputResponse.statusCode, 400);
  assert.equal(providerCalls, 0);

  const missingConfigResponse = makeResponse();
  const unconfiguredHandler = createCheckoutHandler({ env: {}, fetchImpl: async () => { providerCalls += 1; }, rateLimit: () => true });
  await unconfiguredHandler({
    method: 'POST',
    headers: { host: 'geopinder-arcade.vercel.app', 'x-forwarded-proto': 'https', origin: ORIGIN, 'content-type': 'application/json' },
    body: { name: '홍길동', email: 'supporter@example.com', consent: true }
  }, missingConfigResponse);
  assert.equal(missingConfigResponse.statusCode, 503);
  assert.equal(providerCalls, 0);
}

await testValidCheckoutFlow();
await testRejectsMissingConfigAndUnsafeUrl();
testPayloadValidation();
await testHandlerGuardsBeforeProviderCall();
console.log('StepPay checkout contract tests passed.');
