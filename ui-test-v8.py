# v8 tarayıcı testi: bildirim zili + rozetler, mesajlaşma (okundu bilgisi, mobil sohbet düzeni), favoriler; konsol hatası ve mobil taşma yakalar.
# Kullanım: python3 tests/ui-test-v8.py   (SHOTS=klasör ile ekran görüntüsü alır)   Gerekli: pip install playwright; playwright install chromium
import subprocess, time, os, sys, tempfile, urllib.parse
from playwright.sync_api import sync_playwright, expect
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = tempfile.mkdtemp(); PORT = '3121'; B = 'http://localhost:' + PORT
env = {**os.environ, 'PORT': PORT, 'DATA_DIR': d, 'NODE_ENV': 'test'}
SHOTS = os.environ.get('SHOTS')
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen(['node', 'server/index.js'], env=env, cwd=ROOT, stdout=open(os.path.join(d, 'srv.log'), 'w'), stderr=subprocess.STDOUT); time.sleep(1.2)
errs = []
def shot(pg, name):
  if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=False)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    def ctx(w=1200, h=800):
      c = br.new_context(viewport={'width': w, 'height': h}); pg = c.new_page(); pg.on('dialog', lambda x: x.accept())
      pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}')); pg.on('console', lambda m: m.type == 'error' and errs.append(f'console: {m.text}'))
      return c, pg
    def api(c, method, path, body=None):
      r = c.request.fetch(B + '/api/v1' + path, method=method, data=body or {}, headers={'Content-Type': 'application/json'}); assert r.ok, (path, r.status, r.text()); return r.json()
    def reg(c, email, typ): return api(c, 'POST', '/auth/register', {'name': 'Test Kişi', 'email': email, 'phone': '05321112233', 'password': 'Sifre1234', 'userType': typ})
    # --- hazırlık (API ile): tedarikçi + firma + ürün, müşteri + teklif talebi + ilk mesaj ---
    cs, ps = ctx(); reg(cs, 'sup@test.com', 'supplier')
    co = api(cs, 'PUT', '/supplier/company', {'name': 'Deneme Gıda', 'contactPerson': 'Ali Veli', 'phone': '05321112233', 'email': 'a@b.co', 'city': 'İstanbul', 'district': 'Kadıköy', 'address': 'Hal Sok. 5', 'deliveryRegions': ['Kadıköy'], 'categories': ['meyve-sebze'], 'delivery': '24 saat', 'minOrder': 100, 'description': 'x'})['company']
    prod = api(cs, 'POST', '/supplier/products', {'name': 'Favori Ürün', 'categoryId': 'meyve-sebze', 'unit': 'kg', 'price': 12.5, 'stock': 'Var'})
    cc, pc = ctx(); reg(cc, 'mus@test.com', 'customer')
    api(cc, 'POST', '/customer/requests', {'offerId': 'u' + prod['id'], 'quantity': 10, 'note': 'Acil'})
    api(cc, 'POST', '/customer/conversations', {'companyId': co['id'], 'text': 'Merhaba, teslimat mümkün mü?'})

    # --- tedarikçi masaüstü: zil rozeti, açılır panel, yan menü rozeti ---
    ps.goto(B + '/tedarikci-paneli'); ps.wait_for_selector('#view h2'); ps.wait_for_selector('#bellN:not([hidden])')
    assert ps.inner_text('#bellN') == '2', ps.inner_text('#bellN')
    ps.click('#bell'); ps.wait_for_selector('#bpanel .nitem'); txt = ps.inner_text('#bpanel')
    assert 'Yeni teklif talebi' in txt and 'Yeni mesaj' in txt, txt
    shot(ps, 'v8-bell-desktop')
    ps.keyboard.press('Escape'); assert ps.locator('#bpanel').is_hidden()
    expect(ps.locator('.snav [data-nbadge=messages]')).to_have_text('1'); expect(ps.locator('.snav [data-nbadge=notifications]')).to_have_text('2')
    # bildirime tıkla -> okundu + ilgili sayfa
    ps.click('#bell'); ps.click('#bpanel .nitem:has-text("Yeni teklif talebi")'); ps.wait_for_url('**/tedarikci-paneli/teklifler**'); ps.wait_for_selector('#view h2')
    expect(ps.locator('#bellN')).to_have_text('1')
    # bildirimler sayfası
    ps.goto(B + '/tedarikci-paneli/bildirimler'); ps.wait_for_selector('#nl .nitem'); assert ps.locator('#nl .nitem.unread').count() == 1
    ps.click('#nra'); expect(ps.locator('#nl .nitem.unread')).to_have_count(0); expect(ps.locator('#bellN')).to_be_hidden()

    # --- tedarikçi: konuşmayı aç -> okundu; yanıt gönder ---
    ps.goto(B + '/tedarikci-paneli/mesajlar'); ps.wait_for_selector('.msgs .m')  # masaüstünde ilk konuşma otomatik açılır ve okundu olur
    ps.click('.citem'); ps.wait_for_selector('.msgs .m'); expect(ps.locator('.citem.unread')).to_have_count(0)
    assert 'teslimat' in ps.inner_text('.msgs'); ps.fill('#mf input', 'Evet, 24 saatte teslim ederiz.'); ps.click('#mf button'); ps.wait_for_selector('.msgs .m.me')
    assert 'Gönderildi' in ps.locator('.msgs .m.me').last.inner_text(); shot(ps, 'v8-messages-supplier')

    # --- müşteri: yeni mesaj bildirimi, okundu ✓✓ bilgisi ---
    pc.goto(B + '/musteri'); pc.wait_for_selector('#view h2'); pc.wait_for_selector('#bellN:not([hidden])'); pc.click('#bell'); pc.wait_for_selector('#bpanel .nitem'); assert 'Yeni mesaj' in pc.inner_text('#bpanel'); pc.keyboard.press('Escape')
    pc.goto(B + '/musteri/mesajlar'); pc.wait_for_selector('.citem'); pc.click('.citem'); pc.wait_for_selector('.msgs .m.me'); assert 'Okundu' in pc.locator('.msgs .m.me').first.inner_text(), pc.locator('.msgs').inner_text()
    expect(pc.locator('#bellN')).to_be_hidden(); shot(pc, 'v8-messages-customer')

    # --- favoriler: ürün + tedarikçi ekle / favori sayfasından kaldır ---
    key = urllib.parse.quote('favori ürün~kg', safe='~')
    pc.goto(B + '/urun/' + key); pc.wait_for_selector('h1 .heart'); pc.click('h1 .heart'); pc.wait_for_selector('h1 .heart.on')
    pc.goto(B + '/tedarikci/' + co['id']); pc.wait_for_selector('h1 .heart'); pc.click('h1 .heart'); pc.wait_for_selector('h1 .heart.on')
    pc.goto(B + '/musteri/favoriler'); pc.wait_for_selector('#view .card'); t = pc.inner_text('#view'); assert 'Favori Ürün' in t and 'Deneme Gıda' in t, t
    shot(pc, 'v8-favorites'); n0 = pc.locator('#view .heart.on').count(); pc.locator('#view .heart.on').first.click(); expect(pc.locator('#view .heart.on')).to_have_count(n0 - 1)
    pc.goto(B + '/musteri/favoriler'); pc.wait_for_selector('#view h2'); assert pc.locator('#view .heart.on').count() == n0 - 1

    # --- mobil (390px): taşma yok, zil paneli ekrana sığar, sohbet liste/ayrıntı geçişi ---
    cm, pm = ctx(390, 800); api(cm, 'POST', '/auth/login', {'email': 'mus@test.com', 'password': 'Sifre1234'})
    sc = api(cs, 'GET', '/supplier/conversations')[0]['id']; api(cs, 'POST', f'/supplier/conversations/{sc}/messages', {'text': 'Mobil için yeni mesaj'})
    pm.goto(B + '/musteri'); pm.wait_for_selector('#view h2'); pm.wait_for_selector('#bellN:not([hidden])')
    ov = lambda: pm.evaluate('document.documentElement.scrollWidth - window.innerWidth'); assert ov() <= 1, ('dashboard taşma', ov())
    pm.click('#bell'); pm.wait_for_selector('#bpanel .nitem'); bb = pm.locator('#bpanel').bounding_box(); assert bb['x'] >= 0 and bb['x'] + bb['width'] <= 390, bb; shot(pm, 'v8-bell-mobile'); pm.keyboard.press('Escape')
    pm.goto(B + '/musteri/mesajlar'); pm.wait_for_selector('.citem'); assert pm.locator('.cthread').is_hidden() and pm.locator('.clist').is_visible(); assert ov() <= 1, ('liste taşma', ov())
    shot(pm, 'v8-messages-mobile-list'); pm.click('.citem'); pm.wait_for_selector('.msgs .m'); assert pm.locator('.clist').is_hidden() and pm.locator('.backbtn').is_visible(); assert ov() <= 1, ('sohbet taşma', ov())
    shot(pm, 'v8-messages-mobile-thread'); pm.click('#back'); assert pm.locator('.clist').is_visible()
    pm.goto(B + '/musteri/bildirimler'); pm.wait_for_selector('#nl .nitem'); assert ov() <= 1, ('bildirim sayfası taşma', ov()); shot(pm, 'v8-notifications-mobile')
    br.close()
  assert not errs, errs
  print('UI v8 testi geçti')
finally:
  srv.kill()
