#!/usr/bin/env python3
import json, re, urllib.parse, urllib.request, time
from pathlib import Path
from PIL import Image
from io import BytesIO
ROOT=Path(__file__).resolve().parents[1]; CACHE=ROOT/'.landmark-cache'
BASE='https://nkxpjjaqytbihqjofwhc.supabase.co'; BUCKET='geopinder-landmarks'
KEY=re.search(r"supabaseAnonKey\s*:\s*'([^']+)'",(ROOT/'config.js').read_text()).group(1)
HEAD={'User-Agent':'GeoPinder/1.0 landmark image updater'}
QUERIES={247:'St Peter Basilica Vatican',262:'Old Town Square Prague',266:'Oslofjord Norway',273:'Maidan Nezalezhnosti Kyiv',343:'Douala Cameroon'}

def get(url):
 r=urllib.request.Request(url,headers=HEAD)
 with urllib.request.urlopen(r,timeout=40) as x:return json.loads(x.read())
def candidate(q):
 p={'action':'query','list':'search','srsearch':q,'srnamespace':'6','srlimit':'10','format':'json','origin':'*'}
 d=get('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(p))
 for item in d.get('query',{}).get('search',[]):
  title=item['title']
  if not re.search(r'\.(jpe?g|png)$',title,re.I): continue
  p2={'action':'query','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':'960','format':'json','origin':'*'}
  pages=get('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(p2)).get('query',{}).get('pages',{})
  for page in pages.values():
   if page.get('imageinfo'):
    info=page['imageinfo'][0]
    return title,info.get('thumburl') or info.get('url'),info
 raise RuntimeError('no text candidate')
def one(row):
 title,url,info=candidate(QUERIES[row['id']]); time.sleep(1)
 req=urllib.request.Request(url,headers=HEAD)
 with urllib.request.urlopen(req,timeout=45) as r:im=Image.open(BytesIO(r.read())).convert('RGB')
 im.thumbnail((1200,900),Image.Resampling.LANCZOS); path=CACHE/f"{row['id']}.jpg"; im.save(path,'JPEG',quality=88,optimize=True,progressive=True)
 u=f'{BASE}/storage/v1/object/{BUCKET}/{path.name}'
 req=urllib.request.Request(u,data=path.read_bytes(),method='POST',headers={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'image/jpeg','cache-control':'31536000'})
 with urllib.request.urlopen(req,timeout=60) as r:r.read()
 public=f'{BASE}/storage/v1/object/public/{BUCKET}/{path.name}'
 u=f'{BASE}/rest/v1/geopinder_places?id=eq.{row["id"]}'
 req=urllib.request.Request(u,data=json.dumps({'img':public}).encode(),method='PATCH',headers={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'application/json','Prefer':'return=minimal'})
 with urllib.request.urlopen(req,timeout=30) as r:r.read()
 return {'id':row['id'],'name':row['name'],'title':title,'source_url':'https://commons.wikimedia.org/wiki/'+urllib.parse.quote(title.replace(' ','_')),'download_url':url,'license':(info.get('extmetadata',{}).get('LicenseShortName',{}) or {}).get('value',''),'storage_url':public}
rows={r['id']:r for r in json.loads(Path('/tmp/geopinder-places-latest.json').read_text())}
manifest=json.loads((ROOT/'landmark-attributions.json').read_text()); manifest['failures']=[]
for i in QUERIES:
 try:
  x=one(rows[i]); manifest['items']=[a for a in manifest['items'] if a['id']!=i]+[x]; print('OK',x['id'],x['title'],flush=True)
 except Exception as e: manifest['failures'].append({'id':i,'name':rows[i]['name'],'error':str(e)}); print('FAIL',i,e,flush=True)
manifest['items'].sort(key=lambda x:x['id']); (ROOT/'landmark-attributions.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if manifest['failures']: raise SystemExit(2)
