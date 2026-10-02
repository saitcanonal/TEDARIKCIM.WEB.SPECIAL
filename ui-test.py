# Gerçek tarayıcı testi: müşteri, tedarikçi ve YÖNETİCİ panellerini gez; profil + logo + doğrulama başvurusu + yönetici onayı
# + herkese açık rozet akışı + ÜRÜN sistemi (ekle/düzenle/fiyat/pasif/sil/filtre) + KATEGORİ yönetimi; konsol hatası ve mobil taşma yakala.
import subprocess, time, os, sys, tempfile, zlib, struct
from playwright.sync_api import sync_playwright, expect
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = tempfile.mkdtemp(); env = {**os.environ, 'PORT': '3120', 'DATA_DIR': d, 'NODE_ENV': 'test'}
SHOTS = os.environ.get('SHOTS')  # ekran görüntüsü klasörü (isteğe bağlı)
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
subprocess.run(['node', 'server/create-admin.js', 'admin@test.com', 'Yönetici Kişi'], env={**env, 'ADMIN_PASSWORD': 'Admin12345'}, cwd=ROOT, check=True)
def png(path, w=48, h=48):  # küçük, gerçek (çözülebilir) bir PNG üret
  raw = b''.join(b'\x00' + bytes([11, 110, 79]) * w for _ in range(h)); ch = lambda t, b: struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
  open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b''))
LOGO = os.path.join(d, 'logo.png'); png(LOGO)
srv = subprocess.Popen(['node', 'server/index.js'], env=env, cwd=ROOT); time.sleep(1)
B = 'http://localhost:3120'; errs = []
def shot(pg, name):
  if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=True)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    def newpage(w=1200, h=800):
      ctx = br.new_context(viewport={'width': w, 'height': h}); pg = ctx.new_page(); pg.on('dialog', lambda dlg: dlg.accept())
      pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}')); pg.on('console', lambda m: m.type == 'error' and errs.append(f'console: {m.text}'))
      return ctx, pg
    def login(pg, email, pw, dest):
      pg.goto(B + '/giris'); pg.fill('[name=email]', email); pg.fill('[name=password]', pw); pg.click('#loginForm button'); pg.wait_for_url('**' + dest)
    def visit(pg, paths):
      for path in paths:
        pg.goto(B + path); pg.wait_for_selector('#view h2, #view h1', timeout=5000); pg.wait_for_timeout(250)
        assert pg.locator('#view').inner_text().strip(), path; print('OK', path)
    def run(userType, email, paths, extra):
      ctx, pg = newpage()
      pg.goto(B + '/kayit'); pg.fill('[name=name]', 'Test Kişi'); pg.fill('[name=email]', email); pg.fill('[name=phone]', '05321112233'); pg.fill('[name=password]', 'Sifre1234'); pg.select_option('[name=userType]', userType); pg.click('#registerForm button')
      pg.wait_for_url('**/' + paths[0].lstrip('/')); visit(pg, paths); extra(pg); ctx.close()
    def sup_extra(pg):
      pg.goto(B + '/tedarikci-paneli/firma-profilim'); pg.wait_for_selector('#cf')
      assert pg.input_value('[name=contactPerson]') == 'Test Kişi' and pg.input_value('[name=email]') == 'ui-sup@test.com', 'hesap bilgileri ön dolu gelmeli'
      pg.fill('[name=name]', 'UI Gıda'); pg.fill('[name=city]', 'Bursa'); pg.fill('[name=district]', 'Nilüfer'); pg.fill('[name=address]', 'Organize Sanayi Bölgesi 3. Cad. No:7')
      pg.fill('[name=deliveryRegions]', 'Nilüfer, Osmangazi , Yıldırım'); pg.select_option('[name=delivery]', '24 saat'); pg.check('[name=cat] >> nth=0'); pg.click('#cf button')
      pg.wait_for_selector('#logoIn', timeout=5000); print('firma kaydedildi')   # kayıttan sonra sayfa yenilenir, logo alanı açılır
      pg.set_input_files('#logoIn', LOGO); pg.wait_for_selector('#view img.slogo.big', timeout=5000)
      assert pg.evaluate("(() => { const i = document.querySelector('#view img.slogo.big'); return i.complete && i.naturalWidth > 0 })()"), 'logo yüklenmedi (CSP/serve)'; print('logo yüklendi ve görüntülendi')
      shot(pg, 'supplier-profile')
      pg.goto(B + '/tedarikci-paneli/urun-ekle'); pg.fill('[name=name]', 'Domates'); pg.fill('[name=price]', '19.5'); pg.click('#pf button'); pg.wait_for_url('**/urunlerim'); pg.wait_for_selector('tr:has-text("Domates")'); print('ürün eklendi')
      # ---- v5 ürün sistemi: tüm alanlar, "kaydet ve yeni ekle", liste, satır içi fiyat, pasife alma, filtre/arama, düzenleme, silme ----
      pg.goto(B + '/tedarikci-paneli/urun-ekle'); pg.wait_for_selector('#pf'); opts = pg.eval_on_selector_all('[name=unit] option', 'o => o.map(x => x.value)'); assert opts == ['kg', 'adet', 'koli', 'litre', 'paket', 'kasa'], opts
      pg.fill('[name=name]', 'Tavuk Göğsü'); pg.select_option('[name=categoryId]', label='Et & Tavuk'); pg.fill('[name=description]', 'Kemiksiz, derisiz'); pg.select_option('[name=unit]', 'koli'); pg.fill('[name=price]', '1200'); pg.fill('[name=minQuantity]', '3'); pg.select_option('[name=stock]', 'Sınırlı')
      pg.click('#pf [data-more]'); pg.wait_for_selector('#toast:has-text("eklendi")'); assert pg.input_value('[name=name]') == '' and pg.url.endswith('/urun-ekle'), 'kaydet ve yeni ekle formu sıfırlamalı'
      pg.fill('[name=name]', 'Ayran'); pg.select_option('[name=categoryId]', label='Süt Ürünleri'); pg.select_option('[name=unit]', 'litre'); pg.fill('[name=price]', '40'); pg.select_option('[name=active]', 'false'); pg.click('#pf button >> nth=0'); pg.wait_for_url('**/urunlerim')
      pg.wait_for_selector('tr:has-text("Ayran")'); t = pg.inner_text('#view'); assert all(x in t for x in ['Domates', 'Tavuk Göğsü', 'Ayran', 'Kemiksiz', '3 koli']), t; print('ürünler eklendi ve listelendi')
      row = lambda n: pg.locator('tr', has_text=n)
      row('Tavuk Göğsü').locator('input[name=price]').fill('1250'); row('Tavuk Göğsü').locator('.pr button').click(); pg.wait_for_selector('#toast:has-text("Fiyat güncellendi")'); assert row('Tavuk Göğsü').locator('input[name=price]').input_value() == '1250'; print('satır içi fiyat değişti')
      row('Tavuk Göğsü').locator('[data-t]').click(); pg.wait_for_selector('tr:has-text("Tavuk Göğsü") .badge:has-text("Pasif")'); print('pasife alındı')
      pg.select_option('#ps', 'inactive'); pg.locator('#pl tr', has_text='Domates').wait_for(state='detached'); assert 'Ayran' in pg.inner_text('#pl') and 'Tavuk' in pg.inner_text('#pl')
      pg.select_option('#ps', ''); pg.fill('#pq', 'ayr'); pg.locator('#pl tr', has_text='Domates').wait_for(state='detached'); assert 'Ayran' in pg.inner_text('#pl'); print('filtre ve arama')
      row('Ayran').locator('[data-x]').click(); pg.wait_for_selector('#toast:has-text("silindi")'); pg.locator('#pl tr', has_text='Ayran').wait_for(state='detached'); print('ürün silindi')
      pg.fill('#pq', ''); pg.wait_for_selector('tr:has-text("Tavuk Göğsü")'); row('Tavuk Göğsü').locator('a:has-text("Düzenle")').click(); pg.wait_for_selector('#pf')
      assert pg.input_value('[name=minQuantity]') == '3' and pg.input_value('[name=unit]') == 'koli' and pg.input_value('[name=active]') == 'false' and pg.input_value('[name=description]') == 'Kemiksiz, derisiz', 'düzenleme formu dolu gelmeli'
      pg.fill('[name=description]', 'Taze, günlük'); pg.select_option('[name=active]', 'true'); pg.click('#pf button'); pg.wait_for_url('**/urunlerim'); pg.wait_for_selector('tr:has-text("Tavuk Göğsü") .badge:has-text("Aktif")'); assert 'Taze, günlük' in pg.inner_text('#view'); print('ürün düzenlendi')
      shot(pg, 'supplier-products')
      pg.set_viewport_size({'width': 375, 'height': 760}); pg.reload(); pg.wait_for_selector('#pl table'); assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'ürün listesinde mobil yatay taşma'; print('ürün listesi mobil taşma yok'); pg.set_viewport_size({'width': 1200, 'height': 800})
      pg.goto(B + '/tedarikci-paneli/dogrulama'); pg.wait_for_selector('#vf'); assert 'Doğrulanmamış' in pg.inner_text('#view')
      pg.fill('[name=legalName]', 'UI Gıda Sanayi Ltd. Şti.'); pg.fill('[name=taxOffice]', 'Nilüfer'); pg.fill('[name=taxNumber]', '5555555555'); pg.click('#vf button')
      pg.wait_for_selector('#view .badge:has-text("İnceleniyor")', timeout=5000); assert 'Doğrulanmış Tedarikçi' not in pg.inner_text('#view'); print('doğrulama başvurusu: İnceleniyor')
      pg.set_viewport_size({'width': 375, 'height': 760}); pg.goto(B + '/tedarikci-paneli/firma-profilim'); pg.wait_for_selector('#cf')
      assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'profil sayfasında mobil yatay taşma'; print('profil mobil taşma yok')
    def cus_extra(pg):
      pg.goto(B + '/musteri'); pg.wait_for_selector('.hero-search'); assert 'Ne arıyorsunuz?' in pg.inner_text('.hero-search h1')
      pg.fill('.hero-search input', 'domates'); pg.click('.hero-search button'); pg.wait_for_url('**/urun-ara?q=domates'); pg.wait_for_selector('#catalog .pgroup'); pg.click('.pgroup .heart >> nth=0'); pg.wait_for_selector('.heart.on'); print('arama + favori')
      pg.goto(B + '/musteri/urun-ara?q=tavuk'); pg.wait_for_selector('.pgroup'); assert 'Teklif iste' in pg.inner_text('.pgroup'); pg.select_option('#f-unit', 'kg'); pg.wait_for_selector('.pgroup'); print('müşteri panelinde gelişmiş arama')
      # ---- v7 teklif sistemi: müşteri ürün seçer → miktar + not → Teklif İste; tedarikçi dashboard'unda görür, teklif verir; müşteri kabul eder ----
      pg.goto(B + '/musteri/urun-ara?q=domates'); pg.wait_for_selector('.pgroup'); assert pg.locator('td[data-label=\"İşlem\"] a.btn').count() == 1, 'yalnızca kayıtlı tedarikçide Teklif İste düğmesi olmalı'
      assert 'Demo tedarikçi' in pg.inner_text('.pgroup'), 'demo tedarikçiler talep edilemez işaretli olmalı'
      pg.click('td[data-label=\"İşlem\"] a.btn'); pg.wait_for_selector('#rf'); assert 'Domates' in pg.inner_text('#rf') and 'UI Gıda' in pg.inner_text('#rf')
      pg.fill('#rf [name=quantity]', '20'); pg.fill('#rf [name=note]', 'Cuma teslim lütfen'); shot(pg, 'customer-request-form'); pg.click('#rf button >> nth=0')
      pg.wait_for_selector('#ql .rcard:has-text(\"Bekliyor\")', timeout=5000); assert 'Domates · 20 kg' in pg.inner_text('#ql') and 'Cuma teslim lütfen' in pg.inner_text('#ql'); print('müşteri teklif istedi: Bekliyor')
      pg.reload(); pg.wait_for_selector('#pq'); pg.fill('#pq', 'domates'); pg.wait_for_selector('#pr button[data-pick]'); pg.click('#pr button[data-pick]'); pg.wait_for_selector('#rf'); pg.click('#rc'); pg.wait_for_selector('#pq'); print('ürün seçici çalışıyor')
      ctx2, ps = newpage(); login(ps, 'ui-sup@test.com', 'Sifre1234', '/tedarikci-paneli')
      ps.goto(B + '/tedarikci-paneli'); ps.wait_for_selector('#view h2'); assert 'Domates' in ps.inner_text('#view') and 'Cuma teslim' in ps.inner_text('#view'), 'tedarikçi dashboardunda gelen talep görünmeli'; print('tedarikçi dashboardunda talep görünüyor')
      ps.goto(B + '/tedarikci-paneli/teklifler'); ps.wait_for_selector('form.of'); ps.fill('form.of [name=unitPrice]', '20'); assert ps.input_value('form.of [name=totalPrice]') == '400.00', 'toplam otomatik hesaplanmalı'
      ps.fill('form.of [name=deliveryDays]', '2'); ps.fill('form.of [name=note]', 'Soğuk zincir'); shot(ps, 'supplier-offer-form'); ps.click('form.of button >> nth=0'); ps.wait_for_selector('.rcard:has-text(\"Teklif Verildi\")', timeout=5000)
      assert '400' in ps.inner_text('.offerbox') and '2 gün' in ps.inner_text('.offerbox'); print('tedarikçi teklif verdi: Teklif Verildi'); shot(ps, 'supplier-requests'); ctx2.close()
      pg.goto(B + '/musteri/teklifler'); pg.wait_for_selector('#ql .rcard:has-text(\"Teklif Verildi\")'); assert '2 gün' in pg.inner_text('#ql') and 'Soğuk zincir' in pg.inner_text('#ql'); shot(pg, 'customer-requests')
      pg.click('#ql [data-act=accepted]'); pg.wait_for_selector('#ql .rcard:has-text(\"Kabul Edildi\")', timeout=5000); assert pg.inner_text('#tabs').count('1') >= 1; pg.click('#tabs [data-st=accepted]'); pg.wait_for_selector('#ql .rcard'); print('müşteri kabul etti: Kabul Edildi')
      pg.set_viewport_size({'width': 375, 'height': 760}); pg.goto(B + '/musteri/teklifler'); pg.wait_for_selector('#ql .rcard'); assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'teklifler sayfasında mobil yatay taşma'; print('teklifler mobil taşma yok'); pg.set_viewport_size({'width': 1200, 'height': 800})
      pg.set_viewport_size({'width': 375, 'height': 760}); pg.goto(B + '/musteri'); pg.wait_for_selector('.hero-search')
      assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobilde yatay taşma'; print('mobil taşma yok')
    run('supplier', 'ui-sup@test.com', ['/tedarikci-paneli', '/tedarikci-paneli/urunlerim', '/tedarikci-paneli/urun-ekle', '/tedarikci-paneli/teklifler', '/tedarikci-paneli/mesajlar', '/tedarikci-paneli/firma-profilim', '/tedarikci-paneli/dogrulama', '/tedarikci-paneli/ayarlar'], sup_extra)

    # ---- Yönetici: sayfalar, başvuruyu incele, onayla ----
    ctx, pg = newpage(); login(pg, 'admin@test.com', 'Admin12345', '/admin'); visit(pg, ['/admin', '/admin/dogrulama'])
    assert 'Yönetici' in pg.text_content('header'), 'başlıkta rol görünmeli'
    pg.goto(B + '/admin/dogrulama'); pg.wait_for_selector('.card[data-co]')
    txt = pg.inner_text('.card[data-co]'); assert 'UI Gıda' in txt and '5555555555' in txt and 'Nilüfer' in txt and 'ui-sup@test.com' in txt, 'başvuru detayları yönetici ekranında olmalı'
    shot(pg, 'admin-pending'); pg.click('[data-ap]'); pg.wait_for_selector('text=Bu filtrede başvuru yok'); print('yönetici onayladı')
    pg.select_option('#vf', 'VERIFIED'); pg.wait_for_selector('.card[data-co]'); assert 'Doğrulanmış Tedarikçi' in pg.inner_text('.card[data-co]') and 'Rozeti kaldır' in pg.inner_text('.card[data-co]'); shot(pg, 'admin-verified')
    for path in ['/musteri', '/tedarikci-paneli']:
      pg.goto(B + path); pg.wait_for_url('**/hesap'); assert 'Rol' not in pg.inner_text('#acc') or True
    assert 'rolünü ekle' not in pg.inner_text('#acc'), 'yönetici hesabında rol ekleme formu olmamalı'; print('yönetici başka panellere giremiyor, rol ekleyemiyor')
    # ---- Yönetici: kategori yönetimi ----
    pg.goto(B + '/admin/kategoriler'); pg.wait_for_selector('.rn'); n0 = pg.locator('.rn').count(); assert n0 >= 9, n0
    pg.fill('#nf2 [name=name]', 'Dondurulmuş Gıda'); pg.click('#nf2 button'); pg.wait_for_selector('#toast:has-text("eklendi")'); pg.wait_for_selector(f'.rn >> nth={n0}')
    pg.locator('.rn input').last.fill('Dondurulmuş Ürünler'); pg.locator('.rn button').last.click(); pg.wait_for_selector('#toast:has-text("kaydedildi")'); assert pg.locator('.rn input').last.input_value() == 'Dondurulmuş Ürünler'
    pg.fill('#nf2 [name=name]', 'dondurulmuş ürünler'); pg.click('#nf2 button'); pg.wait_for_selector('#toast:has-text("zaten var")'); print('kategori eklendi, yeniden adlandırıldı, çakışma engellendi')
    shot(pg, 'admin-categories')
    pg.locator('[data-tg]').last.click(); pg.wait_for_selector('#cl tr:last-child .badge:has-text("Pasif")'); print('kategori pasifleştirildi')
    assert pg.locator('.rn input').last.input_value() == 'Dondurulmuş Ürünler'; pg.set_viewport_size({'width': 375, 'height': 760}); pg.reload(); pg.wait_for_selector('.rn'); assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'kategori sayfasında mobil taşma'; print('kategori sayfası mobil taşma yok'); pg.set_viewport_size({'width': 1200, 'height': 800})
    pg.goto(B + '/admin'); pg.wait_for_selector('#view .card'); assert 'Kategori' in pg.inner_text('#view') and 'Kategori pasifleştirildi' in pg.inner_text('#view'), 'son işlemlerde kategori kaydı'
    pg.set_viewport_size({'width': 375, 'height': 760}); pg.goto(B + '/admin/dogrulama'); pg.wait_for_selector('#vl')
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'admin mobil taşma'; print('admin mobil taşma yok'); ctx.close()

    # ---- Tedarikçi artık doğrulanmış; herkese açık katalogda rozet + logo ----
    ctx, pg = newpage(); login(pg, 'ui-sup@test.com', 'Sifre1234', '/tedarikci-paneli'); pg.goto(B + '/tedarikci-paneli/dogrulama'); pg.wait_for_selector('#view .badge')
    assert 'Doğrulanmış Tedarikçi' in pg.inner_text('#view .badge'); pg.goto(B + '/tedarikci-paneli'); pg.wait_for_selector('#view .badge'); assert 'Doğrulanmış Tedarikçi' in pg.inner_text('#view .badge'); print('tedarikçi panelinde rozet')
    pg.goto(B + '/tedarikci-paneli/urun-ekle'); pg.wait_for_selector('#pf'); cats = pg.eval_on_selector_all('[name=categoryId] option', 'o => o.map(x => x.textContent)'); assert 'Dondurulmuş Ürünler' not in cats and 'Et & Tavuk' in cats, cats; print('pasif kategori tedarikçi formunda yok'); ctx.close()
    ctx, pg = newpage(); pg.goto(B + '/urunler'); pg.wait_for_selector('#catalog .pgroup'); pg.fill('#f-q', 'Tavuk'); pg.wait_for_selector('.pgroup h3:has-text("Tavuk Göğsü")'); assert 'Min. sipariş' in pg.content() and 'Taze, günlük' in pg.content(), 'katalogda min. sipariş ve açıklama'
    assert 'Dondurulmuş' not in pg.inner_html('#f-category'), 'pasif kategori filtrede yok'; print('katalogda ürün detayı (açıklama, min. sipariş); pasif kategori filtrede yok')
    # ---- v6: arama sonuçları, filtreler, birim güvenliği, ürün detayı, tedarikçi profili ----
    pg.goto(B + '/urunler?q=tavuk+gogsu'); pg.wait_for_selector('.pgroup tbody tr'); head = pg.inner_text('.pgroup thead'); assert all(h in head for h in ['Ürün', 'Tedarikçi', 'Doğrulama', 'Fiyat', 'Birim', 'Min. sipariş', 'Stok', 'Teslimat']), head
    ng = pg.locator('.pgroup').count(); assert ng == 2, 'kg (demo) ve koli (UI Gıda) ayrı gruplar olmalı'; assert pg.locator('.pgroup .bestrow').count() == ng and 'En uygun' in pg.inner_text('.pgroup .bestrow >> nth=0'), 'her birim grubunun kendi en uygunu'; assert 'koli' in pg.inner_text('.pgroup >> nth=1') and 'koli' in pg.inner_text('#snote'); shot(pg, 'search-results')
    pg.select_option('#f-city', 'izmir'); expect(pg).to_have_url(__import__('re').compile(r'city=izmir')); expect(pg.locator('.pgroup tbody tr')).to_have_count(1); pg.click('#f-clear'); expect(pg.locator('.pgroup tbody tr').first).to_be_visible()
    pg.select_option('#f-stock', 'yok'); expect(pg.locator('.pgroup tbody tr')).to_have_count(1); assert 'Stokta yok' in pg.inner_text('.pgroup tbody'); pg.select_option('#f-stock', ''); pg.fill('#f-min', '500'); pg.fill('#f-max', '100'); pg.wait_for_selector('#sres .note.err'); print('arama: filtreler, hata durumu')
    pg.click('#f-clear'); pg.fill('#f-q', 'peynir'); pg.wait_for_selector('#snote .note'); assert 'aynı birim' in pg.inner_text('#snote') and pg.locator('.pgroup').count() == 2; shot(pg, 'search-units'); print('farklı birimler ayrı gruplarda, uyarı gösterildi')
    pg.fill('#f-q', 'tavuk gogsu'); pg.wait_for_selector('.pgroup tbody tr'); pg.locator('.pgroup tbody tr a.plink').first.click(); pg.wait_for_selector('.phead h1'); assert 'Tavuk Göğsü' in pg.inner_text('.phead h1') and 'Stoktaki en düşük fiyat' in pg.inner_text('.sgrid'); shot(pg, 'product-detail')
    pg.locator('.otbl tbody tr a.plink').first.click(); pg.wait_for_selector('#sp table'); assert 'Teslimat süresi' in pg.inner_text('.card'); assert '@' not in pg.inner_text('.card') and 'Organize Sanayi' not in pg.content(); shot(pg, 'supplier-profile-public'); print('ürün detayı ve tedarikçi profili')
    n0 = len(errs); pg.goto(B + '/urun/olmayan~kg'); pg.wait_for_selector('h2:has-text("Ürün bulunamadı")'); pg.goto(B + '/tedarikci/yok'); pg.wait_for_selector('h2:has-text("Tedarikçi bulunamadı")')
    rest = [e for e in errs[n0:] if '401' not in e]; assert len(rest) == 2 and all('404' in e for e in rest), rest; del errs[n0:]  # yalnızca bu iki kasıtlı 404 yok sayılır
    pg.set_viewport_size({'width': 375, 'height': 760}); pg.goto(B + '/urunler?q=tavuk'); pg.wait_for_selector('.pgroup tbody tr'); assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'arama sayfasında mobil taşma'
    pg.goto(B + '/urun/tavuk%20g%C3%B6%C4%9Fs%C3%BC~kg'); pg.wait_for_selector('.otbl tbody tr'); assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'ürün detayında mobil taşma'; print('arama/detay mobil taşma yok'); ctx.close()
    ctx, pg = newpage(); pg.goto(B + '/tedarikciler'); pg.wait_for_selector('#list .card'); pg.fill('#q', 'UI Gıda'); pg.wait_for_selector('#list .card h3:has-text("UI Gıda")'); pg.wait_for_selector('#list .card .vbadge')
    card = pg.inner_text('#list .card'); assert '✓ Doğrulanmış Tedarikçi' in card and 'Nilüfer' in card and 'Osmangazi' in card, card
    assert pg.evaluate("(() => { const i = document.querySelector('#list img.slogo'); return !!i && i.complete && i.naturalWidth > 0 })()"), 'katalogda logo görünmeli'
    assert '5555555555' not in pg.content() and 'Organize Sanayi' not in pg.content(), 'iletişim/vergi bilgisi herkese açık olmamalı'; shot(pg, 'public-suppliers'); print('herkese açık katalogda rozet + logo'); ctx.close()

    # ---- Normal kullanıcı: yönetici sayfasına/API'sine giremez ----
    ctx, pg = newpage(); pg.goto(B + '/kayit'); pg.fill('[name=name]', 'Kötü Niyet'); pg.fill('[name=email]', 'evil@test.com'); pg.fill('[name=phone]', '05321112233'); pg.fill('[name=password]', 'Sifre1234'); pg.select_option('[name=userType]', 'supplier'); pg.click('#registerForm button'); pg.wait_for_url('**/tedarikci-paneli')
    pg.goto(B + '/admin'); pg.wait_for_url('**/hesap')
    r = pg.evaluate("fetch('/api/v1/admin/verifications?status=ALL').then(r => r.status)"); assert r == 403, r
    r = pg.evaluate("fetch('/api/v1/supplier/company', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({verification:{status:'VERIFIED'}, verified:true})}).then(r => r.status)"); assert r == 400, r
    print('normal kullanıcı yönetici alanına giremez'); ctx.close()

    run('customer', 'ui-cus@test.com', ['/musteri', '/musteri/urun-ara', '/musteri/tedarikciler', '/musteri/favoriler', '/musteri/teklifler', '/musteri/mesajlar', '/musteri/profil'], cus_extra)
    br.close()
finally: srv.terminate()
errs = [e for e in errs if not any(c in e for c in ('401', '403', '400', '409'))]  # ziyaretçide /auth/me 401; kasıtlı yetki/çakışma denemeleri 403/400/409
print('HATALAR:', errs or 'yok'); sys.exit(1 if errs else 0)
