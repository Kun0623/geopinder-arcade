const COUNTRY_CODE_HEADERS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'x-country-code'
];

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export default function handler(request, response) {
  const countryCode = COUNTRY_CODE_HEADERS
    .map((header) => normalizeCountryCode(request.headers[header]))
    .find(Boolean) || null;

  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(200).json({ countryCode });
}
