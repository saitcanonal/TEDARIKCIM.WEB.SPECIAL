"""V1 kabul: Tavuk Göğsü akışı, ürünler, admin, 7 genişlik, linkler ve konsol.
Gereksinim: pip install playwright==1.51.0; python3 -m playwright install chromium
SHOTS=klasör REPORT=dosya.json python3 tests/ui-final.py
"""
import os, subprocess, tempfile, time, json, statistics, urllib.parse, shutil, urllib.request
from playwright.sync_api import sync_playwright, expect
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); d=tempfile.mkdtemp(); B='http://localhost:3141'
env={**os.environ,'PORT':'3141','DATA_DIR':d,'NODE_ENV':'test'}; PW='TestOnly1234'
errors=[]; failed=[]; links=set(); timings=[]; checks=0; SHOTS=os.environ.get('SHOTS'); REPORT=os.environ.get('REPORT')
if SHOTS: os.makedirs(SHOTS,exist_ok=True)
subprocess.run(['node','server/create-admin.js','admin@final.test','Final Yönetici'],cwd=ROOT,env={**env,'ADMIN_PASSWORD':PW},check=True,capture_output=True)
log=open(os.path.join(d,'server.log'),'w'); srv=subprocess.Popen(['node','server/index.js'],cwd=ROOT,env=env,stdout=log,stderr=log)
for _ in range(100):
 try: urllib.request.urlopen(B+'/api/v1/health'); break
 except Exception: time.sleep(.1)
try:
 with sync_playwright() as p:
  br=p.chromium.launch()
  def context():
   c=br.new_context(viewport={'width':1440,'height':900}); pg=c.new_page(); pg.on('pageerror',lambda e:errors.append(str(e))); pg.on('console',lambda m:errors.append(m.text) if m.type=='error' else None); pg.on('requestfailed',lambda r:failed.append(r.url) if r.failure!='net::ERR_ABORTED' else None); pg.on('response',lambda r:errors.append(str(r.status)+' '+r.url) if r.status>=400 else None); pg.on('dialog',lambda x:x.accept()); return c,pg
  def api(c,m,path,body=None):
   t=time.perf_counter(); r=c.request.fetch(B+'/api/v1'+path,method=m,data=body); timings.append((time.perf_counter()-t)*1000); assert r.ok,(path,r.status,r.text()); return r.json()
  def login(pg,email,dest):
   pg.goto(B+'/giris'); pg.fill('[name=email]',email); pg.fill('[name=password]',PW); pg.click('#loginForm button'); pg.wait_for_url('**'+dest); pg.wait_for_selector('#view h2')
  suppliers=[]
  for i,price in enumerate([195,205]):
   c,pg=context(); api(c,'POST','/auth/register',{'name':'Final Tedarikçi','email':f's{i}@final.test','phone':'05321112233','password':PW,'userType':'supplier'})
   co=api(c,'PUT','/supplier/company',{'name':f'Final Gıda {i+1}','contactPerson':'Final Tedarikçi','phone':'05321112233','email':f's{i}@final.test','city':'İstanbul','district':'Gaziosmanpaşa','address':'Test adresi','deliveryRegions':['İstanbul'],'categories':['et-tavuk'],'delivery':'24 saat'})['company']
   prod=api(c,'POST','/supplier/products',{'name':'Tavuk Göğsü','categoryId':'et-tavuk','unit':'kg','price':price,'stock':'Var'}); api(c,'POST','/supplier/verification',{'taxNumber':str(i+1)*10,'taxOffice':'Test','legalName':'Final Gıda Ltd.'}); api(c,'POST','/auth/logout',{}); suppliers.append((c,pg,co,prod))
  cc,pc=context(); pc.goto(B+'/kayit'); pc.fill('[name=name]','Final Müşteri'); pc.fill('[name=email]','customer@final.test'); pc.fill('[name=phone]','05321112233'); pc.fill('[name=password]',PW); pc.select_option('[name=userType]','customer'); pc.click('#registerForm button'); pc.wait_for_url('**/musteri'); pc.wait_for_selector('#view h2'); api(cc,'POST','/auth/logout',{}); login(pc,'customer@final.test','/musteri')
  pc.goto(B+'/musteri/urun-ara'); pc.fill('#f-q','Tavuk Göğsü'); pc.click('#sf button[type=submit]'); pc.wait_for_selector('.pgroup tbody tr:has-text("Final Gıda 1")'); pc.select_option('#f-sort','expensive'); pc.wait_for_timeout(450); pc.select_option('#f-sort','cheapest'); pc.wait_for_timeout(450)
  data=api(cc,'GET','/offers?q='+urllib.parse.quote('Tavuk Göğsü')+'&unit=kg&sort=cheapest'); prices=[o['price'] for o in data['items']]; assert prices==sorted(prices),prices; assert pc.locator('.pgroup tbody tr:has-text("Final Gıda")').count()==2
  pc.locator('.pgroup .heart').first.click(); expect(pc.locator('.pgroup .heart').first).to_have_class('heart inl on'); co=suppliers[0][2]; pc.locator('.pgroup tbody tr:has-text("Final Gıda 1") a[href^="/tedarikci/"]').click(); pc.wait_for_selector('h1:has-text("Final Gıda 1")'); pc.goto(B+'/musteri/favoriler'); pc.wait_for_selector('#view .card:has-text("Tavuk Göğsü")')
  pc.goto(B+'/musteri/urun-ara?q='+urllib.parse.quote('Tavuk Göğsü')); pc.locator('tr:has-text("Final Gıda 1") a.btn').click(); pc.wait_for_selector('#rf'); pc.fill('#rf [name=quantity]','10'); pc.fill('#rf [name=note]','V1 kabul testi'); pc.click('#rf button >> nth=0'); pc.wait_for_selector('#ql .rcard:has-text("Bekliyor")')
  cs,ps,_,_=suppliers[0]; login(ps,'s0@final.test','/tedarikci-paneli'); ps.goto(B+'/tedarikci-paneli/teklifler'); ps.wait_for_selector('form.of'); assert 'V1 kabul testi' in ps.inner_text('#view'); ps.fill('form.of [name=unitPrice]','190'); ps.fill('form.of [name=deliveryDays]','1'); ps.fill('form.of [name=note]','Soğuk zincir teslim'); ps.click('form.of button >> nth=0'); ps.wait_for_selector('.rcard:has-text("Teklif Verildi")')
  pc.goto(B+'/musteri/teklifler'); pc.wait_for_selector('.rcard:has-text("Teklif Verildi")'); assert '1.900' in pc.inner_text('.offerbox') and 'Soğuk zincir' in pc.inner_text('#view'); pc.goto(B+'/musteri/mesajlar?company='+co['id']); pc.wait_for_selector('#nf'); pc.fill('#nf input','Merhaba, teslimat saati nedir?'); pc.click('#nf button'); pc.wait_for_selector('.msgs .m'); ps.goto(B+'/tedarikci-paneli/mesajlar'); ps.wait_for_selector('.msgs .m'); ps.fill('#mf input','Yarın saat 10:00 teslim ederiz.'); ps.click('#mf button'); ps.wait_for_selector('.msgs .m.me'); pc.reload(); pc.wait_for_selector('.msgs .m:has-text("10:00")')
  ca,pa=context(); login(pa,'admin@final.test','/admin'); pa.goto(B+'/admin/dogrulama'); pa.locator('.card[data-co]',has_text='Final Gıda 1').locator('[data-ap]').click(); pa.wait_for_selector('#toast'); pc.goto(B+'/tedarikci/'+co['id']); pc.wait_for_selector('h1'); assert 'Doğrulanmış' in pc.inner_text('main'); print('13 adımlı akış + admin doğrulama geçti')
  ps.goto(B+'/tedarikci-paneli/urun-ekle'); ps.wait_for_selector('#pf'); ps.fill('[name=name]','V1 Yeni Ürün'); ps.fill('[name=price]','32'); ps.click('#pf button >> nth=0'); ps.wait_for_url('**/urunlerim'); row=ps.locator('tr',has_text='V1 Yeni Ürün'); row.wait_for(); row.locator('input[name=price]').fill('35'); row.locator('.pr button').click(); ps.wait_for_selector('#toast:has-text("Fiyat güncellendi")'); row.locator('[data-t]').click(); row.locator('.badge:has-text("Pasif")').wait_for(); print('Ürün ekleme, fiyat, pasifleştirme geçti')
  cg,pg=context()
  public=['/','/urunler?q=Tavuk','/tedarikciler','/tedarikci/'+co['id'],'/urun/'+urllib.parse.quote('tavuk göğsü~kg',safe='~'),'/hakkimizda','/giris','/kayit','/sifre-unuttum','/sifre-sifirla']
  customer=['/musteri'+s for s in ['', '/urun-ara?q=Tavuk','/tedarikciler','/favoriler','/teklifler','/mesajlar','/bildirimler','/profil']]+['/hesap']
  supplier=['/tedarikci-paneli'+s for s in ['', '/urunlerim','/urun-ekle','/teklifler','/mesajlar','/bildirimler','/firma-profilim','/dogrulama','/ayarlar']]+['/hesap']
  admin=['/admin'+s for s in ['', '/kullanicilar','/tedarikciler','/dogrulama?durum=ALL','/urunler','/kategoriler','/tedarikci/'+co['id']]]+['/hesap']
  for width in [375,390,430,768,1024,1440,1920]:
   for c,page,paths in [(cg,pg,public),(cc,pc,customer),(cs,ps,supplier),(ca,pa,admin)]:
    page.set_viewport_size({'width':width,'height':900})
    for route in paths:
     res=page.goto(B+route); assert res.status==200,(width,route,res.status); page.wait_for_selector('header .logo'); page.wait_for_timeout(120)
     if route.startswith(('/musteri','/tedarikci-paneli','/admin')): page.wait_for_selector('#view h2, #view h1')
     assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),(width,route,'yatay taşma',page.evaluate('[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(e).position!=="absolute").slice(0,8).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right])'))
     for href in page.locator('a[href]').evaluate_all('(a)=>a.map(x=>x.getAttribute("href"))'):
      if href.startswith('/') and not href.startswith('//'): links.add((paths[0],href))
     checks+=1
     if SHOTS and route in ['/musteri/urun-ara?q=Tavuk','/tedarikci-paneli/urunlerim','/admin/kullanicilar']: page.screenshot(path=os.path.join(SHOTS,f'{width}-{route.split("/")[1]}.png'),full_page=True)
   print(f'{width}px: tüm sayfalar geçti')
  contexts={public[0]:cg,customer[0]:cc,supplier[0]:cs,admin[0]:ca}
  for role,href in links:
   r=contexts[role].request.get(B+href); assert r.status<400,('kırık link',href,r.status)
  assert not errors,errors; assert not failed,failed
  for _ in range(25): api(cc,'GET','/offers?q=Tavuk')
  report={'flow':'passed','product_management':'passed','admin_verification':'passed','widths':[375,390,430,768,1024,1440,1920],'page_width_checks':checks,'links_checked':len(links),'console_errors':errors,'network_failures':failed,'api_local_ms':{'median':round(statistics.median(timings),2),'p95':round(sorted(timings)[int(len(timings)*.95)],2)},'note':'Yerel Chromium testi; gerçek cihaz / çok kullanıcılı yük testi değildir.'}
  if REPORT: open(REPORT,'w').write(json.dumps(report,ensure_ascii=False,indent=2))
  print(json.dumps(report,ensure_ascii=False)); br.close()
finally:
 srv.terminate(); srv.wait(timeout=5); log.close(); shutil.rmtree(d)
