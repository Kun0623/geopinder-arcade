const COUNTRY_HEADER = 'x-vercel-ip-country';

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export default function handler(request, response) {
  const detectedCountryCode = normalizeCountryCode(request.headers[COUNTRY_HEADER]);
  const countryCode = detectedCountryCode || 'KR';

  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(200).json({
    countryCode,
    detected: Boolean(detectedCountryCode)
  });
}
