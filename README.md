# TEDARİKÇİM V1 — Final

Sadece responsive web platformu. Mevcut V1 akışları korunmuştur; mobil uygulama veya yeni büyük özellik eklenmemiştir.

## Hızlı çalıştırma (macOS / Linux)

Node.js **22 veya üzeri** kurulu olmalı. ZIP'i açın; terminalde `tedarikcim` klasörüne girin. Uygulamanın harici npm bağımlılığı yoktur.

```bash
npm run setup:demo
npm start
```

İlk komut yerel test hesaplarının şifresini sorar. Şifreyi girerken ekranda göstermez. Sunucuyu **kurulumdan sonra** başlatın. Adres: http://localhost:3000/giris

| Panel | Test e-postası | Açılan sayfa |
|---|---|---|
| Müşteri | musteri@tedarikcim.test | /musteri |
| Tedarikçi | tedarikci@tedarikcim.test | /tedarikci-paneli |
| İkinci tedarikçi | tedarikci2@tedarikcim.test | /tedarikci-paneli |
| Admin | admin@tedarikcim.test | /admin |

Bu dört hesabın şifresi kurulumda sizin girdiğiniz değerdir. ZIP'te şifre veya hazır kullanıcı veritabanı bulunmaz. Demo kurulum iki gerçek panel hesabına bağlı firma ve **195 / 205 TL/kg Tavuk Göğsü** ürünleri oluşturur; admin panelinde iki doğrulama başvurusu vardır. Kurulum yeniden çalıştırılırsa mevcut hesap/şifre değiştirilmez. `NODE_ENV=production` altında demo kurulum kapalıdır. Üretim adminini ayrı e-posta ve şifre ile `npm run create-admin -- eposta@firma.com "Ad Soyad"` üzerinden oluşturun.

Varsayılan veri klasörü `data/`dır; kullanıcılar ve işlemler burada kalıcı saklanır. Uygulama tek Node sürecinde çalışmalıdır. ZIP'teki `dist/` ayrı, doğrulanmış dağıtım paketidir; orada da `npm run setup:demo` ve `npm start` kullanılabilir. Kaynak üzerinde test/build komutları proje kökünde çalıştırılır.

## Teslim öncesi doğrulama

- `npm test`: 84 işlev + 28 yetkilendirme + 27 doğrulama/güvenlik + 4 final regresyon testi geçti (**143** kontrol).
- Tarayıcı: müşteri kayıt/giriş → Tavuk Göğsü → farklı tedarikçi fiyatları → en ucuz sıralama → tedarikçi profili → favori → teklif talebi → tedarikçi giriş/teklif → müşteri teklif görüntüleme → karşılıklı mesajlaşma geçti.
- Ürün ekleme, yeni ürün, fiyat değiştirme, pasifleştirme ve admin doğrulaması arayüzde test edildi.
- **375, 390, 430, 768, 1024, 1440, 1920 px**: 259 sayfa/genişlik kontrolü, sayfa düzeyinde yatay taşma yok. Mobil menü, kaydırılabilen yan menü ve tablolar mevcut tasarımla korunur.
- 107 bağlantı kontrol edildi; geçerli kabul akışında konsol / JavaScript / ağ hatası yok.
- Yerel Chromium ölçümü: API medyan **2,29 ms**, p95 **42,83 ms**. İnternet, gerçek telefon veya eşzamanlı çok kullanıcılı yük testi değildir; genel üretim performansı garantisi oluşturmaz.
- `npm run build`: tüm JavaScript dosyaları sözdizimi, HTML viewport ve statik dosya bağlantıları kontrolünden sonra `dist/` oluşturulur. `npm run test:build`: oluşturulmuş paketi izole veri klasöründe başlatıp 4 panel hesabını, ürün aramasını ve statik dosyaları kontrol eder.
- Ayrıntılar: `TEST-REPORT.md` ve `tests/final-report.json`.

## Bu aşamadaki düzeltmeler

- Ziyaretçi oturum sorgusu 200/null döner; korumalı `/auth/me` 401 vermeye devam eder. Kullanıcı parolası/özeti veya oturum tokenı yanıtlara eklenmez.
- Admin arayüzü müşteri/tedarikçi bildirim API'sine gereksiz 403 üreten istek yapmaz.
- Üst menü 768 / 1024 px'de taşmaması için 1200 px altındaki ekranlarda mevcut açılır menüyü kullanır.
- Aynı e-postayla paralel kayıtta yalnızca bir kullanıcı oluşturulur. Aynı sıfırlama tokenı paralel isteklerde yalnızca bir kere kullanılabilir; ikisi de regresyon testine bağlıdır.
- Build komutu, favicon, şifreyi koda kaydetmeyen yerel hesap kurulumu ve tekrar çalıştırılabilir kabul testi eklendi. Eski tarayıcı testlerinin URL bekleme / otomatik okundu davranışı kontrolleri güncellendi.

## Testleri tekrar çalıştırma

```bash
npm test
# Yalnızca tarayıcı testleri için:
python3 -m pip install playwright==1.51.0
python3 -m playwright install chromium
npm run test:ui
npm run build
npm run test:build
```

## Ortam ve yayınlama notları

Gerçek `.env`, API anahtarı, oturum, kullanıcı veritabanı veya üretim şifresi ZIP'e dahil değildir. `.env.example` yalnızca ayar örneğidir; bu bağımlılıksız uygulama `.env` dosyasını otomatik okumaz. Ayarları ortam değişkeni olarak verin (ör. `PORT=3001 npm start`).

Üretimde HTTPS, `NODE_ENV=production`, doğru `BASE_URL` ve kalıcı/yedeklenen `DATA_DIR` kullanın. Mevcut e-posta modülü yerel geliştirmede `data/outbox.jsonl` dosyasına yazar; **gerçek şifre sıfırlama e-postası gönderimi için SMTP/SES sağlayıcısı ayrıca bağlanmalıdır**. Bu teslimde canlı siteye yayın yapılmamıştır. JSON depo ve bellek içi hız sınırlama tek süreç içindir; çok sunuculu çalıştırma veya yüksek trafik için paylaşımlı veritabanı/depo gerekir.

---

# Önceki sürüm teknik notları — TEDARİKÇİM (v9b-2 – temel güvenlik ve doğrulama)

Restoran, kafe, kasap, market gibi işletmelerin tedarikçi bulup aynı ürünün fiyatını karşılaştırdığı B2B platform.

## Çalıştırma
```
npm start        # http://localhost:3000
npm test         # 84 API/entegrasyon + 28 yetki + 27 doğrulama/güvenlik testi (auth, yetki, IDOR, ürün, kategori, teklif sistemi, bildirim, mesaj gizliliği/okundu, doğrulama, veri taşıma, arama/birim güvenliği/profil)
python3 tests/ui-test-v9a.py  # v9a tarayıcı testi: yönetici paneli (6 bölüm), yükleme/boş/hata durumları, pasif kullanıcı girişi, 390 px mobil taşma
python3 tests/ui-test-v8.py   # v8 tarayıcı testi: bildirim zili, rozetler, mesajlaşma (okundu), favoriler, 390 px mobil düzen
python3 tests/ui-test.py   # isteğe bağlı (yönetici akışı dahil; SHOTS=klasör ile ekran görüntüsü alır): gerçek tarayıcı testi (pip install playwright; playwright install chromium)
```
Node.js 18+ (22 ile test edildi). Harici bağımlılık yok. Ortam değişkenleri: `.env.example`.

## Temel güvenlik ve doğrulama (v9b-2)
Yeni özellik eklenmedi; mevcut davranış korundu. Tüm kontroller **backend'de** yapılır (arayüzdeki `min`/`required` yalnızca kullanım kolaylığıdır) ve `server/validation-test.js` ile doğrudan API'ye karşı sınanır (`npm run test:validation`, 27 test).

| Kontrol | Durum / nasıl sağlanır |
|---|---|
| Negatif / sıfır fiyat | Reddedilir (`400`): ürün oluşturma/güncelleme, `/price`, teklifin birim ve toplam fiyatı. Fiyat > 0, en çok 10.000.000 |
| Negatif / sıfır miktar | Reddedilir (`400`): teklif talebi miktarı, ürün minimum sipariş miktarı, firma minimum sipariş tutarı (0 geçerli; negatif değil). Teslimat süresi 0–90 tam sayı |
| Zorunlu alanlar | Kayıt, firma profili, ürün, teklif talebi, teklif, doğrulama başvurusu, müşteri profili, mesaj, kategori: her alan eksik/boş/yalnızca boşluk ise `400` ve hiçbir kayıt değişmez |
| Geçersiz veri backend'de reddedilir | Tek ortak katı sayı ayrıştırıcı (`server/validate.js`): yalnızca sayı veya `"12,50"` biçimli metin, en çok 2 ondalık. **Dizi, nesne, boolean, `null`, `"0x10"`, `"1e3"`, harfli metin ve sessiz yuvarlama reddedilir.** Metin alanlarına metin dışı tür, liste dışı birim/stok/teslimat değeri, aşırı uzun metin, bozuk/dizi JSON (`400`), büyük gövde (`413`), yanlış içerik türü (`415`) reddedilir |
| Şifreler | `scrypt` + kullanıcıya özel 16 bayt rastgele tuz (`scrypt$tuz$özet`), sabit zamanlı karşılaştırma; düz metin hiçbir yerde yok. Oturum çerezi ve şifre sıfırlama anahtarı veritabanında **SHA-256 özeti** olarak tutulur (ham değer yok). Veri dosyası `0600` |
| Hassas bilgi | Parola özeti, oturum/sıfırlama verisi hiçbir yanıtta yok; kullanıcı yanıtlarında yalnızca `id, name, email, phone, roles, activeRole`; vergi numarası tedarikçiye maskeli (`*******890`), yalnızca yönetici incelemede tam görür; hata yanıtları yığın izi/dosya yolu içermez; `server/`, `data/`, `.env` web'den okunamaz |
| Secret | Koda gömülü anahtar yok; ayarlar yalnızca ortam değişkenlerinden (`.env.example`: `PORT`, `NODE_ENV`, `BASE_URL`). Depo testi gerçek anahtar kalıplarını (sk-…, AKIA…, özel anahtar, bağlantı dizesi vb.) tarar ve `.env`/`data/` bulunmadığını doğrular |

**v9b-2'de bulunup kapatılan açıklar** (v9b-1'de vardı):
1. **Tür karışıklığı ile geçersiz sayı kabulü:** ürün `price`/`minQuantity` ve firma `minOrder` alanları `Number()` ile okunduğu için `[12]`, `true`, `"0x10"`, `"1e3"` kabul ediliyor, `12.999` sessizce `13`'e yuvarlanıyordu. Artık hepsi `400` (negatif/sıfır zaten reddediliyordu).
2. **Vergi numarasında tür karışıklığı → sunucu hatası:** `POST /supplier/verification` gövdesine sayı/dizi olarak gönderilen `taxNumber` kabul edilip olduğu gibi kaydediliyor, ardından `GET /supplier/verification` `500` veriyordu. Artık yalnızca 10 haneli **metin** kabul edilir; daha önce bozuk kaydedilmiş değerler açılışta otomatik (tekrar çalıştırılabilir) onarılır (`store.js`), okuma ayrıca savunmalıdır.
3. **Dizi JSON gövde** (`[...]`) işleyicilere ulaşabiliyordu; artık `400`.
4. **Fiyat filtresi** (`minPrice`/`maxPrice`) `"0x10"`, `"1e3"` gibi yazımları kabul ediyordu; artık yalnızca ondalıklı sayı. Üretimde (`NODE_ENV=production`) `Strict-Transport-Security` başlığı eklendi. Tedarikçi formunda minimum sipariş alanı `step="0.01"` oldu (sunucu kuralıyla tutarlı).

**Doğrulanıp değiştirilmeyenler:** parolalar zaten scrypt+tuz ile saklanıyordu; hiçbir dosyada gerçek anahtar yoktu; arayüz çıktıları kaçışlıydı (XSS taraması); negatif fiyat/miktar zaten engelliydi. Eksik/geçersiz `offerId` mevcut sözleşmeyle `404` döner (alan reddedilir, kayıt oluşmaz).

**Bilinen sınırlar (değiştirilmedi):** scrypt maliyet parametreleri Node varsayılanıdır (N=16384); hız sınırı bellek içidir; yönetici inceleme ekranı vergi numarasını tam gösterir (doğrulama için gerekli, yalnızca `admin` rolü); gerçek e-posta sağlayıcısı yoktur (geliştirmede `data/outbox.jsonl`).

## Yetkilendirme (v9b-1)
Tüm kontroller **backend'de** yapılır; arayüzdeki gizleme/yönlendirme yalnızca kullanım kolaylığıdır. Kurallar ve nerede uygulandıkları:

| Kural | Nasıl sağlanır |
|---|---|
| Girişsiz kullanıcı korumalı API'ye giremez | `index.js → api()`: `auth:true` rota → `401`. Korumasız rota yalnızca 13 izinli genel uç noktadır (sağlık, katalog, kayıt/giriş/çıkış/sıfırlama); testle sabitlenmiştir |
| Normal kullanıcı admin API'lerine giremez | `/admin/*` rotaları `role:'admin'`; **aktif rol** ve **sahip olunan rol** birlikte kontrol edilir → müşteri/tedarikçi `403`. Yönetici hesabı webden oluşturulamaz, role eklenemez, role geçilemez |
| Müşteri ↔ tedarikçi API ayrımı | `/customer/*` yalnızca aktif rolü `customer`, `/supplier/*` yalnızca `supplier`; çift rollü hesapta yalnızca aktif rol geçerlidir; yönetici ikisine de giremez |
| Müşteri başka müşterinin verisini görmez | Her kayıt `customerId === oturumdaki kullanıcı` ile süzülür; başkasının talebi/konuşması/bildirimi/favorisi için `404` (varlığı sızdırılmaz) |
| Tedarikçi başka tedarikçinin ürününü değiştiremez | Ürün uç noktaları `ownerId === oturumdaki kullanıcı` ile bulunur (okuma, düzenleme, fiyat, aktif/pasif, silme) → başkasının ürünü `404` |
| Teklif ve mesaj yalnızca iki tarafa görünür | Talep: `customerId`/`supplierId`; konuşma: iki katılımcı. Diğer müşteri/tedarikçi `404`, yönetici `403`, girişsiz `401` |
| ID değiştirerek başka kayda erişilemez | Kimlik, sahip, hedef, durum, tarih, `from/to/read`, doğrulama alanları **istemciden alınmaz** (gövdeye eklense de yok sayılır); yol parametresi uydurma/garip ise `400/404` (500 değil); kimlikler rastgele ve ≥12 hex |
| Yetki yükseltme yok | Profil/ayar/firma uçları yalnızca beyaz listedeki alanları işler; `roles`, `activeRole`, `email`, `verification` gibi alanlar değiştirilemez |
| Karşı tarafın özel verisi sızmaz | Tedarikçi müşteriyi yalnızca etiketle görür (telefon/e-posta/kimlik yok); müşteri ve herkese açık yanıtlarda tedarikçinin telefon/e-posta/adres/vergi/kullanıcı kimliği yok |

**v9b-1'de bulunup kapatılan açıklar** (v9a'da vardı):
1. **Panel kabuk sayfaları girişsiz açılıyordu:** `/musteri.html`, `/admin.html`, `/tedarikci-paneli.html` rol denetimini atlayarak sunuluyordu (veri sızmıyordu ama sayfa düzeyi yetki atlanıyordu). Artık bu dosyalar doğrudan (büyük/küçük harf fark etmeksizin) `404`; yalnızca `/musteri`, `/admin`, `/tedarikci-paneli` yolları, rol denetimiyle sunulur.
2. **Rol alanında tip karışıklığı:** `POST /auth/add-role` ve `/auth/switch-role` gövdesine `role: ["supplier"]` (dizi/nesne) gönderilince hesabın `roles`/`activeRole` alanı bozuluyor ve hesap kullanılamaz hale geliyordu; `POST /auth/register` `userType` alanı da dizi kabul ediyordu. Artık yalnızca metin kabul edilir (`400`). Daha önce bozulmuş hesaplar açılışta otomatik ve tekrar çalıştırılabilir şekilde onarılır (`store.js`).
3. **Null bayt (`%00`) içeren sayfa yolu `500` veriyordu:** artık `404`.

**Yetki testleri (`server/authz-test.js`, 28 test):** sunucudan dökülen **gerçek rota tablosu** üzerinden (73 rota; `DUMP_ROUTES=1 node server/index.js` rotaları yazdırıp çıkar, ağa açılmaz) otomatik denetler: korumasız rota izinli listede mi, her `/customer|/supplier|/admin` rotası rolüne bağlı mı; ardından her korumalı rota için girişsiz `401` ve yanlış rol `403` (müşteri, tedarikçi, yönetici, çift rollü hesabın iki aktif rolü). Bundan sonra eklenen her rota bu denetime **otomatik** girer; korumasız yeni rota testi kırar. Ayrıca: iki müşteri + iki tedarikçi ile nesne düzeyi (IDOR) ve gövde/ID manipülasyonu, veri sızıntısı taraması, panel `.html` erişimi, tip karışıklığı, garip kimlikler.

**Bilinen sınırlar (bu sürümde değiştirilmedi):** hız sınırı bellek içidir; oturum çerezi giriş/rol değişiminde yenilenmez; pasif/gizli hale gelen tedarikçiyle **mevcut** konuşmada yazışma sürebilir (yeni konuşma/talep başlatılamaz); bir yönetici başka bir yöneticiyi pasifleştirebilir (yalnızca kendini pasifleştiremez).

## İletişim sistemleri (v8)
**Favoriler (müşteri):** ürün ve tedarikçi kalp (♥) düğmesiyle favoriye eklenir/çıkarılır — ürün arama sonuçları, ürün detayı, tedarikçi listesi ve tedarikçi profilinde; `/musteri/favoriler` sayfasında kalbe basmak kartı listeden de kaldırır. Favoriler kullanıcıya özeldir (`POST /customer/favorites {type:'product'|'supplier', refId}` aç/kapa); silinen ürünün favorisi temizlenir.

**Mesajlaşma:** müşteri ↔ tedarikçi, `/musteri/mesajlar` ve `/tedarikci-paneli/mesajlar`. Her mesaj şu alanları taşır: **gönderen** (`from`), **alıcı** (`to`), **mesaj** (`text`, 1–1000), **tarih** (`at`), **okundu/okunmadı** (`read`). Gönderen oturumdan, alıcı konuşmanın diğer katılımcısından, tarih sunucu saatinden türetilir; istemci `from/to/read/at` gönderse bile **yok sayılır**. Konuşma listesi okunmamış sayısı ve son mesajı gösterir; kendi gönderdiğiniz mesajda "✓ Gönderildi" / "✓✓ Okundu" görünür.
- **Okundu mantığı:** konuşmayı açmak (GET) okundu yapmaz; arayüz konuşma görünürken `POST …/conversations/:id/read` çağırır. Bu işlem yalnızca **kendinize gelen** (`to === ben`) mesajları okundu yapar; gönderen kendi mesajını okundu işaretleyemez. Açık sayfa 15 sn'de bir yeni mesajları çeker (gerçek zamanlı/WebSocket yok).
- **Gizlilik (sunucuda):** konuşma yalnızca iki katılımcısına açıktır. Başka müşteri/tedarikçi için okuma, yazma ve okundu işlemleri `404` (varlığı sızdırılmaz), yanlış rol `403`, yönetici `403`, girişsiz `401` döner. Listeler `customerId/supplierId` ile süzülür; yanıtlarda kullanıcı kimliği yoktur (yalnızca `mine`, metin, tarih, okundu). Kendi firmanıza veya gizli (görünürlüğü kapalı) tedarikçiye konuşma başlatılamaz.
- Konuşmayı yalnızca müşteri başlatır (spam önleme); sonra iki taraf da yazabilir. Dakikada 60 mesaj sınırı vardır.

**Bildirimler:** üst çubukta 🔔 zil (okunmamış sayacı + son 8 bildirim, "Tümünü okundu say"), yan menüde **Mesajlar** ve **Bildirimler** rozetleri, tam liste için `/musteri/bildirimler` ve `/tedarikci-paneli/bildirimler` (yalnızca okunmamışları göster, sayfalama). Sayaçlar 30 sn'de bir ve sekmeye dönünce yenilenir; yeni bildirimde kısa uyarı çıkar. Bildirime tıklamak okundu yapar ve ilgili sayfaya götürür.

| Tür | Başlık | Kime | Ne zaman |
|---|---|---|---|
| `request_new` | Yeni teklif talebi | Tedarikçi | Müşteri teklif istedi |
| `offer_new` | Yeni teklif | Müşteri | Tedarikçi teklif verdi |
| `offer_accepted` | Teklif kabul edildi | Tedarikçi | Müşteri teklifi kabul etti |
| `offer_rejected` | Teklif reddedildi | Tedarikçi | Müşteri teklifi reddetti |
| `request_declined` | Talep reddedildi | Müşteri | Tedarikçi talebi geri çevirdi |
| `request_cancelled` | Talep iptal edildi | Tedarikçi | Müşteri talebi iptal etti |
| `message_new` | Yeni mesaj | Alıcı | Yeni mesaj geldi (aynı konuşmanın okunmamış mesajları tek bildirimde toplanır: "Yeni mesaj (3)") |

- Bildirimler sunucuda, olay gerçekleştiği anda üretilir (başarısız/409 işlemler bildirim üretmez); istemci bildirim oluşturamaz. Her bildirim bir kullanıcıya ve **bir role** aittir: çift rollü hesapta yalnızca aktif rolün bildirimleri görünür. Başkasının bildirimini okumak/okundu yapmak `404`; yönetici için bildirim alanı yoktur (`403`).
- Tedarikçi **Ayarlar** sayfasındaki tercihler uygulanır: *Teklif bildirimleri* kapalıysa talep/kabul/ret/iptal bildirimleri, *Mesaj bildirimleri* kapalıysa mesaj bildirimi üretilmez (mesaj yine konuşma listesinde okunmamış olarak görünür). Kullanıcı başına en çok 200 bildirim saklanır.
- **API:** `GET /notifications?page=&limit=&unread=1` → `{items,total,unread,page,pages}` · `GET /notifications/summary` → `{notifications, messages}` (okunmamış sayıları) · `POST /notifications/:id/read` · `POST /notifications/read-all` · Mesaj: `GET|POST /{customer|supplier}/conversations` (liste: `unread`, `lastMine`), `GET /…/:id`, `POST /…/:id/messages {text}`, `POST /…/:id/read`; konuşma başlatma: `POST /customer/conversations {companyId,text}`. Kod: `server/notify.js` (bildirimler), `server/panel.js` (mesajlar), tetikleyiciler `server/requests.js`; arayüz `public/js/app.js` (zil), `dash.js` (mesaj/bildirim sayfaları).
- **Responsive:** zil paneli mobilde ekran genişliğine sığar; mobilde mesajlar "liste → konuşma" akışıyla (← Konuşmalar düğmesi) açılır; 390 px'te yatay taşma yoktur (tarayıcı testiyle doğrulanır).
- **Veri taşıma:** v7 mesajlarına açılışta otomatik (tekrar çalıştırılabilir) `id`, `to` (konuşmanın diğer katılımcısı) ve `read: true` eklenir; yeni `db.notifications` koleksiyonu oluşur. Başka şema değişikliği yoktur.
- **Sınırlar:** e-posta/SMS/push bildirimi yoktur (yalnızca uygulama içi); gerçek zamanlı değil (yoklama); mesajda dosya eki, silme/düzenleme ve "yazıyor…" yoktur.

## Ürün arama ve fiyat karşılaştırma (v6)
Müşteri bir ürünü (ör. "Tavuk Göğsü") aradığında farklı tedarikçilerin tekliflerini yan yana görür. Sayfalar: herkese açık **`/urunler`**, müşteri panelinde **`/musteri/urun-ara`** (aynı arama; ek olarak favori, "Teklif iste", mesaj), **`/urun/<ad~birim>`** (ürün detayı) ve **`/tedarikci/<id>`** (herkese açık tedarikçi profili). Dashboard'daki "Ne arıyorsunuz?" kutusu aramayı doğrudan açar.

**Sonuç sütunları:** Ürün · Tedarikçi · Doğrulama · Fiyat · Birim · Minimum sipariş · Stok · Teslimat. Ürün adı ürün detayına, tedarikçi adı profile gider. Bir teklif satırında "En uygun" rozeti, o birim grubunun **stokta olan** en ucuz teklifindedir (stokta olmayan teklif listelenir, soluk gösterilir, "en uygun" olamaz).

**Filtreler:** Kategori · Şehir (tedarikçinin şehri) · Fiyat (en az/en çok, ₺) · Stok (Tümü / Stokta olanlar / Stokta var / Sınırlı / Stokta yok). Ek olarak **Birim** ve "Yalnızca doğrulanmış tedarikçiler". Kategori/şehir/birim seçenekleri sunucudan **sayılarla** gelir ve seçili filtre kendi seçeneklerini daraltmaz. **Sıralama:** En ucuz · En pahalı · En yeni. Arama, filtre ve sıralama adres çubuğunda tutulur (paylaşılabilir, geri tuşu çalışır).

**Birim güvenliği (farklı birimler asla karşılaştırılmaz):**
- Teklifler **ürün adı + birim** gruplarına ayrılır (`Tavuk Göğsü / kg` ile `Tavuk Göğsü / koli` ayrı gruptur). Fiyat sıralaması, en düşük/en yüksek/ortalama ve "en uygun" yalnızca **aynı grup içinde** hesaplanır.
- Sonuçta birden fazla birim varsa arayüz uyarı gösterir; fiyat filtresi her teklifin kendi birimindeki fiyata uygulanır (uyarı + "Birim" filtresi ile daraltılır).
- "En yeni" tarih birimden bağımsız olduğu için düz (gruplanmamış) listedir; fiyat satırda birimiyle birlikte görünür.
- Ürün detayında aynı ürünün diğer birimleri ayrı bağlantı olarak listelenir, fiyatları karıştırılmaz.

**Sunucu tarafı:** arama, filtreleme, sıralama, gruplama, istatistik ve sayfalama `server/search.js` içinde yapılır; istemciye yalnızca bir sayfa (varsayılan 20, en çok 50 teklif) gider. Aramada Türkçe duyarlı, **aksan duyarsız** eşleşme (`tavuk gogsu` = `Tavuk Göğsü`) ve çok sözcüklü (hepsi geçmeli) arama vardır; eşleşme ürün adı, kategori ve tedarikçi adı üzerindedir; ürün adı tam/baş eşleşmesi öne çıkar. Not: depo hâlâ JSON dosyasıdır; sorgu her istekte bellekte çalışır. Veritabanına geçişte yalnızca `catalog.allOffers()` + `search.js` içindeki süzme/sıralama adımları `WHERE / ORDER BY / LIMIT`'e taşınır, API aynı kalır.

**API:** `GET /api/v1/offers?q=&category=&city=&unit=&minPrice=&maxPrice=&stock=var|sinirli|yok|mevcut&verified=1&supplier=&sort=cheapest|expensive|newest&page=&limit=` → `{ items, total, page, pages, limit, groupCount, groups, facets, meta }` (geçersiz değer `400`). `GET /products/:key` (key = `ad~birim`, küçük harf) · `GET /suppliers/:id`. Tedarikçi çıktısı yalnızca herkese açık alanlardır (telefon, e-posta, adres, yetkili, vergi bilgisi yok); gizli (görünürlüğü kapalı) tedarikçi ve pasif ürün/kategori sonuçlarda ve profilde yoktur.

**Diğer:** fiyatlar artık küsuratlı gösterilir (₺25,50; önceden ₺26'ya yuvarlanıyordu). Demo veriye minimum sipariş miktarı, eklenme tarihi, 3 örnek tedarikçi (şehir/doğrulama filtreleri için) ve kg/koli birim örneği (`Beyaz Peynir`) eklendi. v5 verisi **taşıma gerektirmez**; şema değişmedi.

## Teklif sistemi (v7)
Müşteri, katalogdaki **bir tedarikçinin ürünü** için miktar ve not girerek **"Teklif İste"** der; talep **yalnızca o tedarikçiye** gider. Tedarikçi birim fiyat, toplam fiyat, teslimat süresi ve not girerek teklif verir; müşteri kabul/reddeder veya iptal eder.

**Akış:** Müşteri → `/musteri/urun-ara` (ya da ürün detayı) → tedarikçi satırında **Teklif İste** → `/musteri/teklifler?teklif=<id>` formu (ürün, tedarikçi, liste fiyatı, **Miktar**, **Not**) → **Teklif İste**. Formu açmadan da `/musteri/teklifler` sayfasındaki ürün arama kutusundan ürün/tedarikçi seçilebilir (ör. *Tavuk Göğsü*, 20 kg). Tedarikçi talebi **dashboard'unda** ("Gelen talepler") ve `/tedarikci-paneli/teklifler` sayfasında görür ve **Teklif Ver** / **Talebi Reddet** der.

**Durumlar:**
| Durum | Kod | Ne zaman |
|---|---|---|
| Bekliyor | `pending` | Müşteri talep etti, tedarikçi henüz yanıtlamadı |
| Teklif Verildi | `offered` | Tedarikçi teklif verdi |
| Kabul Edildi | `accepted` | Müşteri teklifi kabul etti (son) |
| Reddedildi | `rejected` | Müşteri teklifi reddetti **ya da** tedarikçi talebi geri çevirdi (`rejectedBy`) (son) |
| İptal | `cancelled` | Müşteri `Bekliyor`/`Teklif Verildi` iken iptal etti (son) |

Geçişler yalnızca sunucuda, mevcut duruma bakılarak yapılır: `pending→offered|rejected|cancelled`, `offered→accepted|rejected|cancelled`. Son durumlardan çıkış yoktur; tekrar/yarış istekleri `409` alır. Sonuçlanmış bir talepten sonra aynı ürün için yeni talep açılabilir; aynı müşteri + ürün için **açık** (Bekliyor/Teklif Verildi) ikinci talep `409`.

**Teklif alanları (tedarikçi):** `unitPrice` (birim fiyat), `totalPrice` (toplam; boş bırakılırsa birim fiyat × miktar hesaplanır, girilirse **tutarlı olmak zorundadır**, aksi halde `400`), `deliveryDays` (0–90 tam gün, 0 = aynı gün), `note` (≤500). Fiyatlar en fazla 2 ondalıklıdır (sessiz yuvarlama yok). Arayüz toplamı birim fiyat yazılırken otomatik doldurur.

**Yetki (hepsi backend'de):**
- Uç noktalar role bağlıdır: müşteri API'leri yalnızca aktif rolü `customer`, tedarikçi API'leri yalnızca `supplier` olan oturumlara açıktır (yanlış rol `403`, girişsiz `401`).
- Nesne düzeyi: müşteri yalnızca `customerId` kendisi olan, tedarikçi yalnızca `supplierId` kendisi olan kayıtları görür/işler. Başkasının kaydı için `404` döner (varlığı sızdırılmaz). Tedarikçi, talebi **yalnızca ürünün sahibi** olduğu için alır; hedef istemciden değil, ürün sahibinden türetilir.
- Durum, sahip, hedef tedarikçi, tarih ve teklif alanları istemciden alınmaz (fazladan alanlar yok sayılır). Yanıtlarda kullanıcı kimliği, e-posta, telefon yoktur; tedarikçi müşteriyi yalnızca etiketle (işletme adı ya da ad), müşteri tedarikçiyi firma adıyla görür.
- Kendi ürününüz için (çift rollü hesap) teklif istenemez; pasif ürün, pasif kategori ve gizli (`visible:false`) tedarikçi için talep açılamaz.

**Sınırlar:** saatte 30 talep, en fazla 50 açık talep; miktar ≤ 1.000.000; ürünün **minimum sipariş miktarının altı** reddedilir.

**Demo tedarikçiler:** örnek katalogdaki (id 1–9) tedarikçilerin yanıt verecek hesabı yoktur; bu satırlarda "Demo tedarikçi" yazar ve **Teklif İste** düğmesi çıkmaz (API `409`). Akışı denemek için bir tedarikçi hesabı açıp firma profilini kaydedin ve ör. `Tavuk Göğsü / kg` ürünü ekleyin; sonra müşteri hesabıyla o ürün için teklif isteyin.

**API:** Müşteri: `GET /customer/request-target/:offerId` · `GET|POST /customer/requests` (`?status=&page=&limit=`; yanıtta durum sayaçları `counts`) · `GET /customer/requests/:id` · `POST /customer/requests/:id/cancel` · `POST /customer/requests/:id/decision {decision:'accepted'|'rejected'}` — Tedarikçi: `GET /supplier/requests` · `GET /supplier/requests/:id` · `POST /supplier/requests/:id/offer {unitPrice,totalPrice,deliveryDays,note}` · `POST /supplier/requests/:id/decline {note}`. `POST /customer/requests` gövdesi: `{ offerId, quantity, note }` (`offerId` katalogdaki `u…` teklif kimliğidir).

**Kod:** `server/requests.js` (iş mantığı + yetki), veri `db.requests`, arayüz `public/js/customer.js` ve `supplier.js` ("Teklifler" sayfaları, tedarikçi dashboard'u). **v6'dan değişiklik:** herkese açık talep sistemi (`/customer/quotes`, `/customer/offers/:id/decision`, `/supplier/quotes`, `/supplier/quotes/:id/offers`) **kaldırıldı**; yerine yukarıdaki hedefli sistem geldi. Uygulama içi bildirimler v8'de eklendi (e-posta yok); teklif revizyonu ve tedarikçi tarafından iptal yoktur.

## Kullanıcı sistemi
- **Kayıt:** Ad Soyad, e-posta, telefon, şifre (min. 8, harf+rakam), kullanım tipi (Müşteri / Tedarikçi / Müşteri + Tedarikçi)
- **Şifre:** scrypt + kullanıcıya özel salt; düz metin saklanmaz
- **Oturum:** rastgele token, sunucuda yalnızca SHA-256 özeti; çerez HttpOnly + SameSite=Lax (+Secure üretimde); 7 gün
- **Yetkilendirme:** backend (API `401/403` + sayfa yönlendirmesi) ve frontend (`app.js` yönlendirme/menü). Dashboard API'leri **aktif role** göre korunur.
- **Rol geçişi:** `/hesap` sayfasında aktif rol değiştirilir; eksik rol şifre onayıyla eklenir.
- **Şifre sıfırlama:** `/sifre-unuttum` → tek kullanımlık, 30 dk geçerli token (veritabanında özeti saklanır); kullanıcı varlığı sızdırılmaz; sıfırlamada tüm oturumlar kapatılır.
- **Diğer:** CSRF (Origin + JSON zorunluluğu), hız sınırı, güvenlik başlıkları (CSP vb.), istek boyutu sınırı.

## Yönetici paneli (v9a)
`/admin` altında 6 sayfa vardır; hepsi yalnızca **aktif rolü `admin`** olan kullanıcıya açıktır (sayfa → `/hesap` yönlendirmesi, API → `401/403`).

| Sayfa | İçerik |
|---|---|
| `/admin` | Dashboard: kullanıcı / tedarikçi / bekleyen başvuru / ürün / kategori sayıları (her biri ilgili bölüme bağlantı), doğrulama özeti, son işlemler |
| `/admin/kullanicilar` | Ad, e-posta, telefon, rol, hesap durumu, kayıt tarihi. Arama (ad/e-posta/telefon), rol ve durum filtresi, sayfalama. **Aktif ⇄ Pasif** |
| `/admin/tedarikciler` | Firma adı, yetkili, şehir, doğrulama durumu, hesap durumu, kayıt tarihi. Arama + filtreler. Satırdan **detaya** gidilir |
| `/admin/tedarikci/<id>` | Detay: firma bilgisi, hesap sahibi, istatistikler, son ürünler, doğrulama bilgisi ve geçmişi; **Onayla / Reddet / Rozeti kaldır**; hesabı pasifleştir / aktifleştir |
| `/admin/dogrulama` | Başvurular (varsayılan: `PENDING`). **İncele** (detaya gider), **Onayla**, **Reddet** (gerekçe 3-300 karakter). Durumlar: `PENDING → VERIFIED / REJECTED` |
| `/admin/urunler` | Tüm tedarikçi ürünleri: ad, tedarikçi, kategori, fiyat, birim, durum, tarih. Arama (ürün/tedarikçi), kategori ve durum filtresi. Katalogda görünmüyorsa nedeni yazılır (ürün / kategori / tedarikçi pasif) |
| `/admin/kategoriler` | Ekle, yeniden adlandır, pasifleştir / aktifleştir. **Silme yoktur** (aşağıya bakın) |

**Pasif hesap kuralları** (`active:false`; alanı olmayan eski kayıtlar aktif sayılır):
- Giriş reddedilir (`403`, "Hesabınız pasif duruma alınmış…"). Mesaj yalnızca **doğru şifre** girilince verilir; yanlış şifrede hesabın pasif olduğu sızdırılmaz.
- Pasifleştirme anında kullanıcının **tüm açık oturumları kapanır**; aktifleştirme eski oturumları geri getirmez, yeniden giriş gerekir. Pasif hesaba şifre sıfırlama e-postası gönderilmez.
- Tedarikçi pasifleşirse firması ve ürünleri **katalogdan, aramadan ve profilinden gizlenir**, ona yeni teklif talebi/mesaj başlatılamaz. Hiçbir veri silinmez; aktifleştirince her şey geri gelir.
- Yönetici **kendi hesabını pasifleştiremez** (sistemden kilitlenmeyi önler). Her durum değişikliği denetim kaydına (`db.audit`) yazılır.

**Kategori güvenliği:** kategori silinmez; pasifleştirilir. Ürünler kategoriye **kimlikle** bağlıdır, bu yüzden pasif kategorideki ürünler bozulmaz (adı hâlâ görünür, yönetici ve tedarikçi listelerinde durur); yalnızca müşteri kataloğunda gizlenir ve tedarikçiler yeni ürün için o kategoriyi seçemez. Yeniden adlandırma tüm ürünlere anında yansır.

**Arayüz:** mevcut Tedarikçim tasarımı; masaüstünde tablo, 760 px altında kart düzeni. Her liste için *yükleme iskeleti*, *boş durum* ("filtreye uyan kayıt yok" / "henüz kayıt yok") ve *hata durumu* ("Sunucuya ulaşılamadı…" + **Tekrar dene**) vardır. Filtreler adres çubuğuna yansır (paylaşılabilir/yenilemeye dayanıklı).

**Kapsam notu:** yönetici ürün listesi yalnızca tedarikçilerin eklediği (`db.products`) ürünleri gösterir; koddaki örnek (demo) katalog verisi yönetilmez.

## Yönetici hesabı oluşturma
Yönetici hesabı **web'den oluşturulamaz** (kayıt, rol ekleme, rol geçişi hepsi `admin`'i reddeder). Yalnızca sunucuda:
```
ADMIN_PASSWORD='Guclu123Sifre' node server/create-admin.js yonetici@firma.com "Ad Soyad"   # veya şifre için etkileşimli istem
```
Aynı `DATA_DIR` kullanılmalı; sunucu çalışıyorsa yeniden başlatın. Giriş normal `/giris` sayfasından yapılır ve `/admin`'e yönlenir. Yönetici hesabına müşteri/tedarikçi rolü eklenemez (görev ayrılığı).

## Ürün sistemi (v5)
Tedarikçi **istediği kadar** ürün ekler (ürün sayısı sınırı yoktur; yalnızca otomatik kötüye kullanıma karşı saatte 600 ekleme hız sınırı vardır). Panel: `/tedarikci-paneli/urunlerim` (liste) ve `/urun-ekle` (ekle/düzenle; "Kaydet ve yeni ürün ekle" ile arka arkaya giriş).

| Alan | Kural |
|---|---|
| Ürün adı | 2–100 karakter. Aynı tedarikçide aynı **ad + birim** (büyük/küçük harf ve Türkçe I/ı duyarsız) ikinci kez eklenemez (409) |
| Kategori | Yönetici tarafından yönetilen **aktif** bir kategori (kimlikle bağlanır) |
| Açıklama | İsteğe bağlı, en fazla 500 karakter; katalogdaki karşılaştırma tablosunda tedarikçi adının altında görünür |
| Fiyat | > 0 ve ≤ 10.000.000 (₺, 2 ondalık) |
| Birim | `kg`, `adet`, `koli`, `litre`, `paket`, `kasa` |
| Minimum sipariş | Seçili birim cinsinden miktar (> 0, varsayılan 1); katalogda "Min. sipariş" sütunu |
| Stok durumu | `Var`, `Sınırlı`, `Yok` |
| Durum | **Aktif** (katalogda görünür) / **Pasif** (gizli) |

- **Tedarikçi yapabilir:** ekle, düzenle (tüm alanlar), **fiyat değiştir** (listede satır içi hızlı fiyat + `priceUpdatedAt` tarihi), pasife al / aktifleştir, **sil** (kalıcı; ürünün favori kayıtları da temizlenir). Liste arama, kategori/durum filtresi ve sayfalama (25–100) içerir.
- **Yalnızca kendi ürünleri:** tüm ürün uç noktaları `ownerId === oturumdaki kullanıcı` ile süzülür; başkasının ürünü için `404` döner (varlığı sızdırılmaz). `id`, `ownerId`, `createdAt` gibi alanlar istemciden alınmaz. Müşteri/yönetici/girişsiz erişim `403/401`.
- **Katalog:** yalnızca *aktif* ürünler ve *aktif* kategoriler görünür; aynı ad+birimdeki ürünler (demo dahil) tek kartta fiyat karşılaştırmasına girer.
- **Demo veri:** Tavuk Göğsü, Dana Kıyma, Patates, Ayran, Peçete eklendi (Domates zaten vardı).

## Kategori sistemi (v5)
- Kategoriler artık kod içinde sabit değil, `db.categories` içindedir (`{ id, name, active }`). İlk açılışta 9 varsayılan kategori eklenir.
- **Yönetici** `/admin/kategoriler`: kategori **ekler**, **yeniden adlandırır**, **pasifleştirir/aktifleştirir**. Ad 2–50 karakter, büyük/küçük harf duyarsız benzersiz. **Silme yoktur** (ürün/firma bağlantıları bozulmasın diye).
- Ürünler ve firmalar kategoriye **kimlikle** bağlıdır; yeniden adlandırma katalogda, ürünlerde ve firma profillerinde anında yansır.
- **Pasif kategori:** katalogda ve filtrelerde görünmez, içindeki (demo dahil) ürünler gizlenir, tedarikçi yeni ürün/firma kategorisi olarak seçemez. Tedarikçi mevcut ürününün fiyatını/diğer alanlarını yine düzenleyebilir; ürün listesinde "Kategori pasif" uyarısı görür. Aktifleştirince her şey geri gelir.
- Tüm kategori işlemleri denetim kaydına (`CATEGORY_CREATED/RENAMED/DEACTIVATED/ACTIVATED`) yazılır ve yönetici dashboard'unda görünür.

## Firma profili ve doğrulama (v4)
- **Profil alanları:** firma adı, logo, yetkili kişi, telefon, e-posta, şehir, ilçe, adres, açıklama, teslimat bölgeleri (+ kategoriler, teslimat süresi, minimum sipariş). Yetkili/telefon/e-posta ilk açılışta hesap bilgisinden ön dolu gelir.
- **Logo:** PNG/JPEG/WebP, en fazla 512 KB. Tür, istemcinin beyanına değil dosya içeriğine (magic bytes) göre doğrulanır; SVG kabul edilmez. `DATA_DIR/logos` altında rastgele adla saklanır, `/logos/<ad>` ile `nosniff` başlığıyla sunulur.
- **Herkese açık veri:** katalogda firma adı, logo, şehir/ilçe, açıklama, kategoriler, teslimat bölgeleri ve rozet görünür. **Telefon, e-posta, adres, yetkili kişi ve vergi bilgileri herkese açık değildir** (iletişim platform içi mesajlaşmadan).
- **Durumlar:** `UNVERIFIED` → (tedarikçi başvurur) → `PENDING` → (yönetici) → `VERIFIED` veya `REJECTED`. `REJECTED` firma düzeltip yeniden başvurabilir. Yönetici `VERIFIED` bir firmanın rozetini gerekçe girerek kaldırabilir (`REJECTED`).
- **Rozet:** "✓ Doğrulanmış Tedarikçi" yalnızca `VERIFIED` durumunda, sunucudan gelen `verified` alanıyla çizilir. Tedarikçi API'leri durumu **hiçbir şekilde** değiştiremez: profil kaydı yalnızca izin verilen alanları işler, başvuru yalnızca `PENDING` yapar, karar uç noktaları yalnızca `role: admin` ile çalışır (sunucuda hem aktif rol hem sahip olunan roller kontrol edilir).
- **Firma adı değişirse:** doğrulanmış firma adını değiştirirse rozet yönetici onayı olmadan korunamayacağından durum `PENDING`'e alınır (büyük/küçük harf farkı sayılmaz).
- **Vergi no çakışması:** başka bir firmanın `PENDING`/`VERIFIED` vergi numarasıyla başvuru 409 döner.
- **Denetim kaydı:** başvuru, onay, ret, rozet kaldırma ve otomatik sıfırlama `db.audit`'e yazılır; son işlemler yönetici dashboard'unda görünür. Karar sonucu tedarikçiye e-posta (geliştirmede `outbox.jsonl`) gönderilir.
- **Demo tedarikçiler** (`server/data.js`) örnek veridir; rozetleri sabit kodludur, yönetici onayından gelmez.

## Paneller (v3)
Her panel kendi sayfa ve API alanına sahiptir; yalnızca **aktif rolü** uygun kullanıcı girebilir (aksi halde sayfa `/hesap`'a yönlenir, API `403` döner).
- **Müşteri** `/musteri`: Dashboard ("Ne arıyorsunuz?" araması), Ürün Ara, Tedarikçiler, Favoriler, Teklifler (ürün seç → miktar + not → Teklif İste; gelen teklifi kabul/reddet/iptal), Mesajlar, Bildirimler, Profil
- **Tedarikçi** `/tedarikci-paneli`: Dashboard, Ürünlerim (arama/filtre/sayfalama, hızlı fiyat), Ürün Ekle/Düzenle, Dashboard'da gelen talepler; Teklifler (gelen talebe birim fiyat/toplam/teslimat süresi/not ile teklif ver veya reddet), Mesajlar, Bildirimler, Firma Profilim, Doğrulama, Ayarlar
- **Yönetici** `/admin`: Dashboard, Kullanıcılar, Tedarikçiler (+detay), Doğrulama Başvuruları, Ürünler, Kategoriler — ayrıntı için *Yönetici paneli (v9a)* bölümü
- Tedarikçilerin eklediği ürünler ve firmalar **herkese açık katalogda** demo verilerle birleşir; aynı ürün adı+birim olan fiyatlar karşılaştırma tablosunda yan yana görünür.
- Nesne düzeyinde yetki: kullanıcı yalnızca kendi ürün, talep ve konuşmalarına erişir.

## API (`/api/v1`)
Müşteri: `/customer/{dashboard,favorites,request-target/:offerId,requests,requests/:id,requests/:id/cancel,requests/:id/decision,conversations(+/:id,/:id/messages,/:id/read),profile}` · Tedarikçi: `/supplier/{dashboard,requests,requests/:id,requests/:id/offer,requests/:id/decline,conversations,company,company/logo,verification,settings}` · Yönetici: `/admin/{dashboard,verifications,verifications/:companyId/decision}`

Ürün (tedarikçi, yalnızca kendi ürünleri): `GET /supplier/product-meta` · `GET /supplier/products?q=&category=&status=active|inactive&page=&limit=` · `GET|PUT|DELETE /supplier/products/:id` · `POST /supplier/products` · `POST /supplier/products/:id/price` `{price}` · `POST /supplier/products/:id/active` `{active:boolean}`

Yönetici (v9a): `GET /admin/dashboard` · `GET /admin/users?q=&role=customer|supplier|admin&status=active|inactive&page=&limit=` · `POST /admin/users/:id/active` `{active:boolean}` · `GET /admin/suppliers?q=&verification=PENDING|VERIFIED|REJECTED|UNVERIFIED&account=active|inactive&page=&limit=` · `GET /admin/suppliers/:id` · `GET /admin/verifications?status=` · `POST /admin/verifications/:id/decision` `{decision:'approve'|'reject',reason}` · `GET /admin/products?q=&category=&supplier=&status=active|inactive&page=&limit=`

Kategori (yönetici): `GET|POST /admin/categories` · `PUT /admin/categories/:id` `{name}` · `POST /admin/categories/:id/active` `{active:boolean}`

Açık: `GET /offers /products /products/:key /suppliers /suppliers/:id /categories` (yalnızca aktif, `[{id,name}]`) `/units /health` — `category` filtresi kategori **kimliği** alır.
Bildirim (müşteri/tedarikçi): `/notifications`, `/notifications/summary`, `/notifications/:id/read`, `/notifications/read-all`
Kimlik: `POST /auth/register|login|logout|switch-role|add-role|forgot|reset`, `GET /auth/me`

## Önemli notlar
- **E-posta:** gerçek sağlayıcı bağlı değil. Geliştirmede sıfırlama bağlantıları `data/outbox.jsonl` dosyasına yazılır (`server/mailer.js`). Üretimden önce SMTP/SES bağlayın.
- **Depolama:** `data/db.json` (JSON dosya). Üretim için `server/store.js` bir veritabanıyla değiştirilmelidir.
- **Hız sınırı bellek içidir;** reverse proxy arkasında gerçek istemci IP'si ve çoklu sunucuda ortak depo gerekir.
- **Doğrulama:** belge yükleme henüz yok (vergi dairesi/numarası/ticari unvan beyanı). Vergi numarası sunucuda düz saklanır; üretimde şifrelenmeli/maskelenmeli ve gerçek doğrulama (belge, GİB sorgusu) eklenmelidir.
- **Logo depolama** yerel diskte; çok sunuculu kurulumda nesne depolama (S3 vb.) gerekir.
- **Mesajlaşma** yalnızca müşteri tarafından başlatılır (spam önleme); gerçek zamanlı değil (açık sayfada 15 sn'de bir güncellenir). Bildirim tercihleri (tedarikçi Ayarlar) v8'den itibaren uygulanır.
- **Eski (v8) veriler** açılışta otomatik ve tekrar çalıştırılabilir şekilde taşınır (v9a): firmalara kayıt tarihi (`createdAt`) eklenir (hesap sahibinin kayıt tarihinden; bilinmiyorsa boş). Kullanıcılarda `active` alanı yoksa hesap aktiftir; veri dönüştürmesi gerekmez.
- **Eski (v3) veriler** açılışta otomatik taşınır: `none→UNVERIFIED`, `pending→PENDING`, `approved→VERIFIED`.
- **Eski (v4) veriler** açılışta otomatik ve tekrar çalıştırılabilir şekilde taşınır: kategori adları → kategori kimliği (bilinmeyen ad kaybolmaz, yeni kategori olarak açılır); birimler `lt→litre`, `çuval→paket` (yeni listede `çuval` yok; `kasa` eklendi); ürünlere açıklama `''`, minimum sipariş `1` ve fiyat tarihi eklenir. Müşteri tekliflerindeki eski birimler de çevrilir.
- **Ölçek:** JSON dosya deposu her yazmada tüm dosyayı yeniden yazar; binlerce ürün/tedarikçiye çıkıldığında `store.js` bir veritabanıyla değiştirilmelidir. Ana sayfa ve favoriler için kullanılan `GET /products` sayfalanmaz; ürün araması (`GET /offers`) sayfalıdır.
- **Stok:** stok durumu etikettir (Var/Sınırlı/Yok); adet takibi ve sipariş düşümü yoktur.
- **Eski (v6) veriler** açılışta otomatik ve tekrar çalıştırılabilir şekilde taşınır: eski herkese açık taleplere verilmiş her teklif, ilgili tedarikçiye ait bir teklif talebine çevrilir (`sent→offered`, `accepted`, `rejected`; toplam = birim fiyat × miktar, teslimat süresi boş); **hiç teklifi olmayan açık talepler hedefsiz olduğu için taşınmaz**. Ham eski kayıtlar silinmez, `db.legacyQuotes` altında arşivlenir.
