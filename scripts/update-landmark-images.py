#!/usr/bin/env python3
import json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
ROWS_FILE = Path('/tmp/geopinder-places-latest.json')
OUT_DIR = ROOT / '.landmark-cache'
MANIFEST = ROOT / 'landmark-attributions.json'
PROJECT = 'nkxpjjaqytbihqjofwhc'
BASE = f'https://{PROJECT}.supabase.co'
BUCKET = 'geopinder-landmarks'


def get_key():
    s = (ROOT / 'config.js').read_text(encoding='utf-8')
    m = re.search(r"supabaseAnonKey\s*:\s*'([^']+)'", s)
    if not m:
        raise RuntimeError('supabaseAnonKey not found')
    return m.group(1)

KEY = get_key()
HEADERS = {'User-Agent': 'GeoPinder/1.0 landmark image updater (Wikimedia Commons)'}


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers={**HEADERS, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def choose_candidate(row):
    params = {
        'action': 'query', 'generator': 'geosearch', 'ggsprimary': 'all',
        'ggsnamespace': '6', 'ggsradius': '5000', 'ggscoord': f"{row['lat']}|{row['lng']}",
        'ggslimit': '20', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata',
        'iiurlwidth': '960', 'format': 'json', 'origin': '*'
    }
    data = fetch_json('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params))
    pages = list(data.get('query', {}).get('pages', {}).values())
    pages = [p for p in pages if p.get('imageinfo') and re.search(r'\.(jpe?g|png)$', p.get('title',''), re.I)]
    if not pages:
        raise RuntimeError('no image candidate')
    # Geosearch is already relevance-ranked. Prefer a title containing a distinctive
    # landmark token when available, otherwise use the closest/relevance-ranked image.
    tokens = [t.lower() for t in re.findall(r"[A-Za-z]{4,}", row['name'])]
    scored = []
    for p in pages:
        title = p.get('title', '').lower()
        score = sum(2 for t in tokens if t in title)
        scored.append((score, p))
    scored.sort(key=lambda x: x[0], reverse=True)
    p = scored[0][1]
    info = p['imageinfo'][0]
    return {
        'title': p.get('title', ''),
        'source_url': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(p.get('title','').replace(' ', '_')),
        'download_url': info.get('thumburl') or info.get('url'),
        'artist': (info.get('extmetadata', {}).get('Artist', {}) or {}).get('value', ''),
        'license': (info.get('extmetadata', {}).get('LicenseShortName', {}) or {}).get('value', ''),
    }


def download_and_prepare(row, candidate):
    req = urllib.request.Request(candidate['download_url'], headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as r:
        raw = r.read()
    im = Image.open(BytesIO(raw)).convert('RGB')
    im.thumbnail((1200, 900), Image.Resampling.LANCZOS)
    path = OUT_DIR / f"{row['id']}.jpg"
    im.save(path, 'JPEG', quality=88, optimize=True, progressive=True)
    return path


def upload(path):
    url = f'{BASE}/storage/v1/object/{BUCKET}/{path.name}'
    data = path.read_bytes()
    req = urllib.request.Request(url, data=data, method='POST', headers={
        'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'image/jpeg',
        'cache-control': '31536000'
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        if e.code not in (409,):
            raise RuntimeError(f'upload {path.name}: {e.code} {body}')
    return f'{BASE}/storage/v1/object/public/{BUCKET}/{urllib.parse.quote(path.name)}'


def patch_row(row_id, public_url):
    url = f'{BASE}/rest/v1/geopinder_places?id=eq.{row_id}'
    req = urllib.request.Request(url, data=json.dumps({'img': public_url}).encode(), method='PATCH', headers={
        'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'patch {row_id}: {e.code} {e.read().decode("utf-8", "replace")}')


def main():
    rows = json.loads(ROWS_FILE.read_text(encoding='utf-8'))
    OUT_DIR.mkdir(exist_ok=True)
    manifest = []
    failures = []
    print(f'Processing {len(rows)} landmark records...', flush=True)
    def one(row):
        candidate = choose_candidate(row)
        path = download_and_prepare(row, candidate)
        public_url = upload(path)
        patch_row(row['id'], public_url)
        return {**candidate, 'id': row['id'], 'name': row['name'], 'storage_url': public_url}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(one, r): r for r in rows}
        for i, fut in enumerate(as_completed(futures), 1):
            row = futures[fut]
            try:
                result = fut.result(); manifest.append(result)
                print(f'[{i}/{len(rows)}] OK {row["id"]} {row["name"]}', flush=True)
            except Exception as e:
                failures.append({'id': row['id'], 'name': row['name'], 'error': str(e)})
                print(f'[{i}/{len(rows)}] FAIL {row["id"]} {row["name"]}: {e}', file=sys.stderr, flush=True)
    manifest.sort(key=lambda x: x['id'])
    MANIFEST.write_text(json.dumps({'license_note': 'Images sourced from Wikimedia Commons; see each source_url and license field.', 'items': manifest, 'failures': failures}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Completed: {len(manifest)} uploaded, {len(failures)} failed. Manifest: {MANIFEST}', flush=True)
    if failures: sys.exit(2)

if __name__ == '__main__': main()
