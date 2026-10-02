# v9a tarayıcı testi: yönetici paneli (Dashboard, Kullanıcılar, Tedarikçiler + detay, Doğrulama, Ürünler, Kategoriler).
# Yükleme / boş / hata durumları, pasif kullanıcının giriş mesajı, mobil taşma ve konsol hatası kontrolü.
# Kullanım: python3 tests/ui-test-v9a.py   (SHOTS=klasör ile ekran görüntüsü alır)   Gerekli: pip install playwright; playwright install chromium
import subprocess, time, os, tempfile
from playwright.sync_api import sync_playwright, expect
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = tempfile.mkdtemp(); PORT = '3131'; B = 'http://localhost:' + PORT
ADM = ('yonetici@test.com', 'Admin12345'); PW = 'Sifre1234'
env = {**os.environ, 'PORT': PORT, 'DATA_DIR': d, 'NODE_ENV': 'test'}
SHOTS = os.environ.get('SHOTS')
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
mk = subprocess.run(['node', 'server/create-admin.js', ADM[0], 'Yönetici Kişi'], env={**env, 'ADMIN_PASSWORD': ADM[1]}, cwd=ROOT, capture_output=True, text=True); assert mk.returncode == 0, mk.stderr
srv = subprocess.Popen(['node', 'server/index.js'], env=env, cwd=ROOT, stdout=open(os.path.join(d, 'srv.log'), 'w'), stderr=subprocess.STDOUT); time.sleep(1.2)
errs = []
def until(pg, js, t=6):  # CSP 'unsafe-eval' vermediği için wait_for_function yerine evaluate ile yoklanır (uygulamanın CSP'si gevşetilmez)
  end = time.time() + t
  while time.time() < end:
    if pg.evaluate(js): return
    time.sleep(0.1)
  raise AssertionError('zaman aşımı: ' + js)
def shot(pg, name):
  if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=False)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    def ctx(w=1280, h=800):
      c = br.new_context(viewport={'width': w, 'height': h}); pg = c.new_page(); pg.on('dialog', lambda x: x.accept())
      pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
      pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(f'console: {m.text}'))
      return c, pg
    def api(c, method, path, body=None):
      r = c.request.fetch(B + '/api/v1' + path, method=method, data=body or {}, headers={'Content-Type': 'application/json'}); assert r.ok, (path, r.status, r.text()); return r.json()
    def reg(c, name, email, typ): return api(c, 'POST', '/auth/register', {'name': name, 'email': email, 'phone': '05321112233', 'password': PW, 'userType': typ})
    # --- hazırlık (API): iki tedarikçi (biri başvuru yapmış), ürünler, bir müşteri ---
    cs, _ = ctx(); reg(cs, 'Ali Veli', 'ali@gida.com', 'supplier')
    co = api(cs, 'PUT', '/supplier/company', {'name': 'Deneme Gıda', 'contactPerson': 'Ali Veli', 'phone': '05321112233', 'email': 'a@b.co', 'city': 'İstanbul', 'district': 'Kadıköy', 'address': 'Hal Sok. 5', 'deliveryRegions': ['Kadıköy'], 'categories': ['meyve-sebze'], 'delivery': '24 saat', 'minOrder': 100, 'description': 'Taze ürünler'})['company']
    api(cs, 'POST', '/supplier/products', {'name': 'Elma', 'categoryId': 'meyve-sebze', 'unit': 'kg', 'price': 22.5, 'stock': 'Var'})
    api(cs, 'POST', '/supplier/products', {'name': 'Armut', 'categoryId': 'meyve-sebze', 'unit': 'kg', 'price': 30, 'stock': 'Var', 'active': False})
    api(cs, 'POST', '/supplier/verification', {'taxNumber': '1112223334', 'taxOffice': 'Kadıköy', 'legalName': 'Deneme Gıda Ltd. Şti.'})
    cs2, _ = ctx(); reg(cs2, 'Ayşe Kaya', 'ayse@et.com', 'supplier')
    api(cs2, 'PUT', '/supplier/company', {'name': 'Ege Et', 'contactPerson': 'Ayşe Kaya', 'phone': '05321112233', 'email': 'e@b.co', 'city': 'İzmir', 'district': 'Konak', 'address': 'Liman Cad. 1', 'deliveryRegions': ['Konak'], 'categories': ['et-tavuk'], 'delivery': '48 saat'})
    cc, _ = ctx(); reg(cc, 'Mehmet Müşteri', 'mehmet@musteri.com', 'customer')
    # --- masaüstü: yönetici arayüzden giriş yapar ---
    ca, pa = ctx(); pa.goto(B + '/giris'); pa.fill('[name=email]', ADM[0]); pa.fill('[name=password]', ADM[1]); pa.click('#loginForm button'); pa.wait_for_url('**/admin')
    pa.wait_for_selector('a.seclink'); assert pa.locator('a.seclink').count() == 5, pa.locator('a.seclink').count()
    nav = pa.inner_text('.snav'); [ (_ for _ in ()).throw(AssertionError(x)) for x in ['Dashboard', 'Kullanıcılar', 'Tedarikçiler', 'Doğrulama Başvuruları', 'Ürünler', 'Kategoriler'] if x not in nav ]
    assert 'inceleme bekliyor' in pa.inner_text('#dash'); shot(pa, 'v9a-dashboard-desktop')
    # --- kullanıcılar ---
    pa.click('.snav >> text=Kullanıcılar'); pa.wait_for_selector('#ul table tbody tr'); heads = pa.inner_text('#ul thead')
    for h in ['Ad', 'E-posta', 'Telefon', 'Rol', 'Hesap durumu', 'Kayıt tarihi']: assert h in heads, h
    assert pa.locator('#ul tbody tr').count() == 4; assert 'Siz' in pa.inner_text('#ul'); assert 'Yönetici' in pa.inner_text('#ul') and 'Müşteri' in pa.inner_text('#ul')
    shot(pa, 'v9a-users-desktop')
    pa.fill('[name=q]', 'mehmet'); until(pa, "document.querySelectorAll('#ul tbody tr').length === 1"); assert 'mehmet@musteri.com' in pa.inner_text('#ul')
    pa.fill('[name=q]', 'yokboyleakullanici'); pa.wait_for_selector('#ul >> text=bulunamadı'); assert pa.locator('#ul table').count() == 0   # boş durum
    shot(pa, 'v9a-users-empty'); pa.fill('[name=q]', 'mehmet'); until(pa, "document.querySelectorAll('#ul tbody tr').length === 1")
    pa.click('#ul [data-tg]'); pa.wait_for_selector('#ul .badge.bad'); assert 'Pasif' in pa.inner_text('#ul'); assert 'pasifleştirildi' in pa.inner_text('#toast')
    pa.select_option('select[name=status]', 'inactive'); until(pa, "document.querySelectorAll('#ul tbody tr').length === 1"); pa.select_option('select[name=status]', ''); pa.fill('[name=q]', '')
    # pasif kullanıcı giriş yapamaz (arayüz mesajı)
    cm, pm_ = ctx(); pm_.goto(B + '/giris'); pm_.fill('[name=email]', 'mehmet@musteri.com'); pm_.fill('[name=password]', PW); pm_.click('#loginForm button'); pm_.wait_for_selector('#msg:not([hidden])')
    assert 'pasif' in pm_.inner_text('#msg').lower(), pm_.inner_text('#msg'); assert '/giris' in pm_.url; shot(pm_, 'v9a-login-inactive'); cm.close()
    pa.fill('[name=q]', 'mehmet'); until(pa, "document.querySelectorAll('#ul tbody tr').length === 1"); pa.click('#ul [data-tg]'); until(pa, "document.querySelector('#ul .badge.ok') !== null")  # tekrar aktif
    # --- tedarikçiler + detay ---
    pa.click('.snav >> text=Tedarikçiler'); pa.wait_for_selector('#sl table tbody tr'); assert pa.locator('#sl tbody tr').count() == 2; txt = pa.inner_text('#sl')
    for x in ['Deneme Gıda', 'Ali Veli', 'İstanbul', 'İnceleniyor', 'Doğrulanmamış', 'Aktif']: assert x in txt, x
    shot(pa, 'v9a-suppliers-desktop'); pa.select_option('select[name=verification]', 'PENDING'); until(pa, "document.querySelectorAll('#sl tbody tr').length === 1")
    pa.click('#sl a.plink'); pa.wait_for_selector('#sd h2'); assert '/admin/tedarikci/' + co['id'] in pa.url; assert 'Deneme Gıda' in pa.inner_text('#sd h2'); assert pa.locator('.snav a.on').inner_text().strip().endswith('Tedarikçiler')
    t = pa.inner_text('#sd'); assert 'Elma' in t and 'Armut' in t and '1112223334' in t and 'Deneme Gıda Ltd. Şti.' in t; shot(pa, 'v9a-supplier-detail-desktop')
    # detayda onay -> VERIFIED
    pa.click('#vd [data-ap]'); until(pa, "document.querySelector('#vd .badge.ok') !== null"); assert 'Doğrulanmış' in pa.inner_text('#vd')
    pa.click('#acc'); pa.wait_for_selector('#sd .note.err'); assert 'pasif' in pa.inner_text('#sd .note.err'); pa.click('#acc'); until(pa, "document.querySelector('#sd .note.err') === null")
    pa.goto(B + '/admin/tedarikci/yokboyleid'); pa.wait_for_selector('#sd .note.err'); assert 'bulunamadı' in pa.inner_text('#sd'); assert pa.locator('#sd a[href="/admin/tedarikciler"]').count() == 1   # hata durumu + geri bağlantısı
    # --- doğrulama başvuruları: Ege Et'i reddet; İncele bağlantısı ---
    api(cs2, 'POST', '/supplier/verification', {'taxNumber': '4445556667', 'taxOffice': 'Konak', 'legalName': 'Ege Et Ltd.'})
    pa.goto(B + '/admin/dogrulama'); pa.wait_for_selector('#vl .card'); assert pa.locator('#vl .card').count() == 1 and 'Ege Et' in pa.inner_text('#vl'); assert pa.locator('#vl a[data-incele]').count() == 1
    shot(pa, 'v9a-verifications-desktop'); pa.click('#vl [data-rj]'); pa.fill('#vl [name=reason]', 'Vergi levhası okunmuyor'); pa.click('#vl .rjf button'); pa.wait_for_selector('#vl >> text=Bu filtrede başvuru yok')   # boş durum
    pa.select_option('#vf', 'REJECTED'); pa.wait_for_selector('#vl >> text=Vergi levhası okunmuyor')
    # --- ürünler ---
    pa.click('.snav >> text=Ürünler'); pa.wait_for_selector('#pl table tbody tr'); assert pa.locator('#pl tbody tr').count() == 2; heads = pa.inner_text('#pl thead')
    for h in ['Ürün', 'Tedarikçi', 'Kategori', 'Fiyat', 'Birim', 'Durum', 'Tarih']: assert h in heads, h
    assert 'Deneme Gıda' in pa.inner_text('#pl') and 'Meyve & Sebze' in pa.inner_text('#pl') and '22,5' in pa.inner_text('#pl'); shot(pa, 'v9a-products-desktop')
    pa.select_option('select[name=status]', 'inactive'); until(pa, "document.querySelectorAll('#pl tbody tr').length === 1"); assert 'Armut' in pa.inner_text('#pl'); assert 'Ürün pasif' in pa.inner_text('#pl'); pa.select_option('select[name=status]', '')
    # --- kategoriler: ekle, düzenle, pasifleştir; ürünler bozulmaz ---
    pa.click('.snav >> text=Kategoriler'); pa.wait_for_selector('#cl table'); pa.fill('#nf2 [name=name]', 'Dondurulmuş Gıda'); pa.click('#nf2 button'); pa.wait_for_selector('#cl input[value="Dondurulmuş Gıda"]')
    pa.fill('#cl input[value="Dondurulmuş Gıda"]', 'Dondurulmuş Ürünler'); pa.click('#cl form.rn:has(input[value="Dondurulmuş Gıda"]) button'); pa.wait_for_selector('#cl input[value="Dondurulmuş Ürünler"]')
    row = pa.locator('#cl tr', has=pa.locator('input[value="Meyve & Sebze"]')); row.locator('[data-tg]').click(); until(pa, "[...document.querySelectorAll('#cl tr')].some(r => r.querySelector('input[value=\"Meyve & Sebze\"]') && r.querySelector('.badge.bad'))")
    pa.goto(B + '/admin/urunler'); pa.wait_for_selector('#pl tbody tr'); assert pa.locator('#pl tbody tr').count() == 2; assert 'Kategori pasif' in pa.inner_text('#pl') and 'Meyve & Sebze' in pa.inner_text('#pl'); shot(pa, 'v9a-products-hidden-category')
    pa.goto(B + '/admin/kategoriler'); pa.wait_for_selector('#cl table'); pa.locator('#cl tr', has=pa.locator('input[value="Meyve & Sebze"]')).locator('[data-tg]').click(); until(pa, "![...document.querySelectorAll('#cl .badge.bad')].some(b => b.closest('tr').querySelector('input[value=\"Meyve & Sebze\"]'))")
    shot(pa, 'v9a-categories-desktop')
    # --- hata durumu: API erişilemez -> anlaşılır mesaj + "Tekrar dene" ---
    pa.goto(B + '/admin/kullanicilar'); pa.wait_for_selector('#ul table'); pa.route('**/api/v1/admin/users*', lambda r: r.abort()); pa.fill('[name=q]', 'a'); pa.wait_for_selector('#ul .note.err'); assert 'Sunucuya ulaşılamadı' in pa.inner_text('#ul'); shot(pa, 'v9a-users-error')
    pa.unroute('**/api/v1/admin/users*'); pa.click('#ul [data-retry]'); pa.wait_for_selector('#ul table')
    # --- yükleme durumu: yavaş yanıt sırasında iskelet görünür ---
    def slow(route): time.sleep(0.8); route.continue_()
    pa.route('**/api/v1/admin/products*', slow); pa.goto(B + '/admin/urunler'); pa.wait_for_selector('#pl .skel'); shot(pa, 'v9a-products-loading'); pa.wait_for_selector('#pl table'); pa.unroute('**/api/v1/admin/products*')
    ca.close()
    # --- müşteri / tedarikçi özellikleri bozulmadı (tarayıcı) ---
    cs3, ps = ctx(); ps.goto(B + '/giris'); ps.fill('[name=email]', 'ali@gida.com'); ps.fill('[name=password]', PW); ps.click('#loginForm button'); ps.wait_for_url('**/tedarikci-paneli'); ps.wait_for_selector('#view h2')
    ps.goto(B + '/tedarikci-paneli/urunlerim'); ps.wait_for_selector('#view h2'); ps.goto(B + '/admin'); assert ps.url.endswith('/hesap'), ps.url
    cm2, pc = ctx(); pc.goto(B + '/giris'); pc.fill('[name=email]', 'mehmet@musteri.com'); pc.fill('[name=password]', PW); pc.click('#loginForm button'); pc.wait_for_url('**/musteri'); pc.wait_for_selector('#view h2'); pc.goto(B + '/urunler'); pc.wait_for_selector('.card')
    # --- mobil (390px): tüm yönetici sayfaları taşmaz, tablolar kart düzenine geçer ---
    cmob, pm = ctx(390, 800); pm.goto(B + '/giris'); pm.fill('[name=email]', ADM[0]); pm.fill('[name=password]', ADM[1]); pm.click('#loginForm button'); pm.wait_for_url('**/admin')
    ov = lambda: pm.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    for path, sel, name in [('/admin', 'a.seclink', 'dashboard'), ('/admin/kullanicilar', '#ul tbody tr', 'users'), ('/admin/tedarikciler', '#sl tbody tr', 'suppliers'), ('/admin/dogrulama?durum=ALL', '#vl .card', 'verifications'), ('/admin/urunler', '#pl tbody tr', 'products'), ('/admin/kategoriler', '#cl tbody tr', 'categories'), ('/admin/tedarikci/' + co['id'], '#sd h2', 'supplier-detail')]:
      pm.goto(B + path); pm.wait_for_selector(sel); assert ov() <= 1, (path, 'yatay taşma', ov()); shot(pm, 'v9a-mobile-' + name)
    pm.goto(B + '/admin/kullanicilar'); pm.wait_for_selector('#ul tbody tr'); assert pm.evaluate("getComputedStyle(document.querySelector('#ul thead')).position") == 'absolute'; assert pm.evaluate("getComputedStyle(document.querySelector('#ul tbody tr')).display") == 'block'
    br.close()
  assert not errs, errs
  print('UI v9a testi geçti')
finally:
  srv.kill()
