#!/usr/bin/env python3
import json, re, urllib.parse, urllib.request, time
from pathlib import Path
from PIL import Image
from io import BytesIO
ROOT=Path(__file__).resolve().parents[1]; CACHE=ROOT/'.landmark-cache-wiki'; ROWS=json.loads(Path('/tmp/geopinder-places-latest.json').read_text())
BASE='https://nkxpjjaqytbihqjofwhc.supabase.co'; BUCKET='geopinder-landmarks'
KEY=re.search(r"supabaseAnonKey\s*:\s*'([^']+)'",(ROOT/'config.js').read_text()).group(1)
HEAD={'User-Agent':'GeoPinder/1.0 landmark image updater'}
QUERIES={
244:'Eiffel Tower',245:'Louvre Museum',246:'Colosseum',247:"St Peter's Basilica",248:'Grand Canal Venice',249:'Leaning Tower of Pisa',250:'Big Ben',251:'London Eye',252:'Stonehenge',253:'Sagrada Familia',254:'Alhambra',255:'Brandenburg Gate',256:'Neuschwanstein Castle',257:'Parthenon',258:'Santorini',259:'Amsterdam canals',260:"Saint Basil's Cathedral",261:"St. Stephen's Cathedral Vienna",262:'Old Town Square Prague',263:'Hungarian Parliament Building',264:'Lake Geneva',265:'Gamla stan',266:'Oslofjord',267:'Hagia Sophia',268:'Cappadocia',269:'Edinburgh Castle',270:'Florence Cathedral',271:'Mont-Saint-Michel',272:'Belem Tower',273:'Maidan Nezalezhnosti',274:'N Seoul Tower',275:'Gyeongbokgung',276:'Tokyo Tower',277:'Mount Fuji',278:'Kiyomizu-dera',279:'Forbidden City',280:'Great Wall of China',281:'Victoria Peak Hong Kong',282:'Taipei 101',283:'Senado Square',284:'Marina Bay Sands',285:'Gardens by the Bay',286:'Petronas Towers',287:'Wat Arun',288:'Phuket',289:'Angkor Wat',290:'Hoan Kiem Lake',291:'Golden Bridge Ba Na Hills',292:'Intramuros',293:'Ubud',294:'Taj Mahal',295:'India Gate',296:'Burj Khalifa',297:'Burj Al Arab',298:'Sheikh Zayed Grand Mosque',299:'Western Wall',300:'Petra Jordan',301:'Kaaba',302:'Mount Everest',303:'Colombo Sri Lanka',304:'Statue of Liberty',305:'Times Square',306:'Lincoln Memorial',307:'Golden Gate Bridge',308:'Hollywood Sign',309:'Las Vegas Strip',310:'Grand Canyon',311:'Niagara Falls',312:'CN Tower',313:'Banff National Park',314:'Teotihuacan',315:'Chichen Itza',316:'Cancun',317:'Old Havana',318:'San Juan Puerto Rico',319:'Christ the Redeemer',320:'Copacabana Beach',321:'Machu Picchu',322:'Nazca Lines',323:'Bogota',324:'Obelisk of Buenos Aires',325:'Iguazu Falls',326:'Torres del Paine',327:'Easter Island',328:'Mitad del Mundo',329:'Sydney Opera House',330:'Uluru',331:'Great Barrier Reef',332:'Sky Tower Auckland',333:'Queenstown New Zealand',334:'Great Pyramid of Giza',335:'Great Sphinx of Giza',336:'Table Mountain',337:'Cape of Good Hope',338:'Victoria Falls',339:'Serengeti National Park',340:'Mount Kilimanjaro',341:'Sahara',342:'Avenue of the Baobabs',343:'Douala Cameroon'}

TITLES={
244:'Eiffel Tower',245:'Louvre Museum',246:'Colosseum',247:"St. Peter's Basilica",248:'Grand Canal (Venice)',249:'Leaning Tower of Pisa',250:'Big Ben',251:'London Eye',252:'Stonehenge',253:'Sagrada Família',254:'Alhambra',255:'Brandenburg Gate',256:'Neuschwanstein Castle',257:'Parthenon',258:'Santorini',259:'Canals of Amsterdam',260:"Saint Basil's Cathedral",261:"St. Stephen's Cathedral, Vienna",262:'Old Town Square (Prague)',263:'Hungarian Parliament Building',264:'Lake Geneva',265:'Gamla stan',266:'Oslofjord',267:'Hagia Sophia',268:'Cappadocia',269:'Edinburgh Castle',270:'Florence Cathedral',271:'Mont-Saint-Michel',272:'Belém Tower',273:'Maidan Nezalezhnosti',274:'N Seoul Tower',275:'Gyeongbokgung',276:'Tokyo Tower',277:'Mount Fuji',278:'Kiyomizu-dera',279:'Forbidden City',280:'Great Wall of China',281:'Victoria Peak',282:'Taipei 101',283:'Senado Square',284:'Marina Bay Sands',285:'Gardens by the Bay',286:'Petronas Towers',287:'Wat Arun',288:'Phuket',289:'Angkor Wat',290:'Hoan Kiem Lake',291:'Golden Bridge (Vietnam)',292:'Intramuros',293:'Ubud',294:'Taj Mahal',295:'India Gate',296:'Burj Khalifa',297:'Burj Al Arab',298:'Sheikh Zayed Grand Mosque',299:'Western Wall',300:'Petra',301:'Kaaba',302:'Mount Everest',303:'Colombo',304:'Statue of Liberty',305:'Times Square',306:'Lincoln Memorial',307:'Golden Gate Bridge',308:'Hollywood Sign',309:'Las Vegas Strip',310:'Grand Canyon',311:'Niagara Falls',312:'CN Tower',313:'Banff National Park',314:'Teotihuacan',315:'Chichen Itza',316:'Cancún',317:'Old Havana',318:'San Juan, Puerto Rico',319:'Christ the Redeemer (statue)',320:'Copacabana',321:'Machu Picchu',322:'Nazca Lines',323:'Bogotá',324:'Obelisk of Buenos Aires',325:'Iguazu Falls',326:'Torres del Paine National Park',327:'Easter Island',328:'Ciudad Mitad del Mundo',329:'Sydney Opera House',330:'Uluru',331:'Great Barrier Reef',332:'Sky Tower (Auckland)',333:'Queenstown, New Zealand',334:'Great Pyramid of Giza',335:'Great Sphinx of Giza',336:'Table Mountain',337:'Cape of Good Hope',338:'Victoria Falls',339:'Serengeti National Park',340:'Mount Kilimanjaro',341:'Sahara',342:'Avenue of the Baobabs',343:'Douala'}

def get(url):
 req=urllib.request.Request(url,headers=HEAD)
 with urllib.request.urlopen(req,timeout=40) as r:return json.loads(r.read())
def find(query):
 import time
 allowed={'Public domain','CC0','CC BY 1.0','CC BY 2.0','CC BY 3.0','CC BY 4.0','CC BY-SA 1.0','CC BY-SA 2.0','CC BY-SA 3.0','CC BY-SA 4.0'}
 params={'action':'query','generator':'search','gsrsearch':query,'gsrnamespace':'6','gsrlimit':'10','prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':'1400','format':'json','origin':'*'}
 last=None
 for attempt in range(6):
  try:
   d=get('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params))
   pages=list(d.get('query',{}).get('pages',{}).values())
   candidates=[]
   words=[w.lower() for w in re.findall(r'[a-z0-9]+',query.lower()) if len(w)>2]
   for x in pages:
    ii=(x.get('imageinfo') or [{}])[0]; meta=ii.get('extmetadata',{}); lic=re.sub('<[^>]+>','',meta.get('LicenseShortName',{}).get('value','')).strip()
    src=ii.get('thumburl') or ii.get('url'); title=x.get('title','')
    low=title.lower(); score=sum(1 for w in words if w in low)
    if src and lic in allowed and not any(bad in low for bad in ['logo','map','flag','collage','coat of arms']): candidates.append((score,title,src,lic,meta.get('Artist',{}).get('value','')))
   if candidates:
    candidates.sort(key=lambda x:(x[0],-len(x[1])),reverse=True); score,title,src,lic,artist=candidates[0]
    return {'title':title,'thumbnail':{'source':src},'fullurl':'https://commons.wikimedia.org/wiki/'+urllib.parse.quote(title.replace(' ','_')),'license':lic,'artist':re.sub('<[^>]+>','',artist)}
   raise RuntimeError('no acceptable Commons image')
  except Exception as e:
   last=e; time.sleep(2*(attempt+1))
 raise last or RuntimeError('Commons lookup failed')
def upload(path):
 u=f'{BASE}/storage/v1/object/{BUCKET}/{path.name}'
 for attempt in range(6):
  try:
   req=urllib.request.Request(u,data=path.read_bytes(),method='POST',headers={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'image/jpeg','cache-control':'31536000'})
   with urllib.request.urlopen(req,timeout=90) as r:r.read()
   return f'{BASE}/storage/v1/object/public/{BUCKET}/{urllib.parse.quote(path.name)}'
  except Exception:
   if attempt == 5: raise
   time.sleep(3*(attempt+1))
def patch(rowid,url):
 u=f'{BASE}/rest/v1/geopinder_places?id=eq.{rowid}'
 req=urllib.request.Request(u,data=json.dumps({'img':url}).encode(),method='PATCH',headers={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'application/json','Prefer':'return=minimal'})
 with urllib.request.urlopen(req,timeout=30) as r:r.read()
CACHE.mkdir(exist_ok=True); manifest=[]
for row in ROWS:
 i=row['id']; q=QUERIES[i]; wiki_title=TITLES[i]; page=find(q); src=page['thumbnail']['source']; title=page['title']; print(i,q,'=>',title,flush=True)
 req=urllib.request.Request(src,headers=HEAD)
 with urllib.request.urlopen(req,timeout=45) as r: im=Image.open(BytesIO(r.read())).convert('RGB')
 im.thumbnail((1200,900),Image.Resampling.LANCZOS); path=CACHE/f'commons-{i}.jpg'; im.save(path,'JPEG',quality=88,optimize=True,progressive=True)
 public=upload(path); patch(i,public)
 manifest.append({'id':i,'name':row['name'],'query':q,'commons_title':title,'source_url':page.get('fullurl'),'license':page.get('license'),'artist':page.get('artist'),'storage_url':public})
 time.sleep(.3)
(ROOT/'landmark-commons-attributions.json').write_text(json.dumps({'license_note':'Images are selected from Wikimedia Commons with the recorded reuse license. CC BY/CC BY-SA images require attribution and CC BY-SA requires compatible sharing terms; verify each source page before commercial use.','items':manifest},ensure_ascii=False,indent=2)+'\n')
print('DONE',len(manifest))
