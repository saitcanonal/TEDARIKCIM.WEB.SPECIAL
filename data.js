// Örnek (mock) veri. Kategoriler artık veritabanında (db.categories) yönetilir; demo veri kategorilere SABİT KİMLİKLE (id) bağlanır,
// böylece yönetici bir kategoriyi yeniden adlandırsa bile demo ürünler/tedarikçiler bağlı kalır.
const defaultCategories = [
  { id: 'et-tavuk', name: 'Et & Tavuk' }, { id: 'meyve-sebze', name: 'Meyve & Sebze' }, { id: 'sut-urunleri', name: 'Süt Ürünleri' },
  { id: 'yag-bakliyat', name: 'Yağ & Bakliyat' }, { id: 'kuru-gida', name: 'Kuru Gıda' }, { id: 'icecek', name: 'İçecek' },
  { id: 'ambalaj-sarf', name: 'Ambalaj & Sarf' }, { id: 'temizlik-hijyen', name: 'Temizlik & Hijyen' }, { id: 'unlu-mamuller', name: 'Unlu Mamuller' }
];
const suppliers = [
  { id: 1, name: 'Anadolu Et & Süt', city: 'İstanbul', categoryIds: ['et-tavuk', 'sut-urunleri'], rating: 4.7, minOrder: 1500, delivery: '24 saat', verified: true },
  { id: 2, name: 'Taze Hal Toptan', city: 'İstanbul', categoryIds: ['meyve-sebze'], rating: 4.5, minOrder: 800, delivery: 'Aynı gün', verified: true },
  { id: 3, name: 'Ege Zeytinyağı Ltd.', city: 'İzmir', categoryIds: ['yag-bakliyat', 'kuru-gida'], rating: 4.8, minOrder: 2000, delivery: '48 saat', verified: true },
  { id: 4, name: 'Kuzey Ambalaj', city: 'Bursa', categoryIds: ['ambalaj-sarf'], rating: 4.2, minOrder: 1000, delivery: '48 saat', verified: false },
  { id: 5, name: 'Marmara İçecek', city: 'Kocaeli', categoryIds: ['icecek'], rating: 4.4, minOrder: 1200, delivery: '24 saat', verified: true },
  { id: 6, name: 'Başkent Gıda Pazarı', city: 'Ankara', categoryIds: ['kuru-gida', 'yag-bakliyat', 'sut-urunleri'], rating: 4.3, minOrder: 1800, delivery: '48 saat', verified: true },
  // v6: fiyat karşılaştırma ve şehir/doğrulama filtrelerini göstermek için ek örnek tedarikçiler
  { id: 7, name: 'Ege Tavuk & Et', city: 'İzmir', categoryIds: ['et-tavuk'], rating: 4.6, minOrder: 1200, delivery: '24 saat', verified: true },
  { id: 8, name: 'Bursa Gıda Toptan', city: 'Bursa', categoryIds: ['meyve-sebze', 'kuru-gida', 'sut-urunleri'], rating: 4.1, minOrder: 900, delivery: '48 saat', verified: false },
  { id: 9, name: 'Ankara Et Merkezi', city: 'Ankara', categoryIds: ['et-tavuk'], rating: 4.4, minOrder: 2000, delivery: 'Aynı gün', verified: true }
];
// Teklif: tedarikçi, birim fiyat (ürünün biriminde), stok, minimum sipariş (ürünün biriminde), eklenme tarihi (sabit: "en yeni" sıralaması için)
const O = (supplierId, price, stock, minQuantity, createdAt) => ({ supplierId, price, stock, minQuantity, createdAt });
const P = (id, name, category, unit, offers) => ({ id, name, category, unit, offers });
const products = [
  P(1, 'Dana Kuşbaşı', 'et-tavuk', 'kg', [O(1, 460, 'Var', 5, '2026-08-12'), O(6, 485, 'Var', 10, '2026-08-20')]),
  P(2, 'Bütün Tavuk', 'et-tavuk', 'kg', [O(1, 98, 'Var', 10, '2026-08-12'), O(6, 104, 'Sınırlı', 20, '2026-08-21'), O(7, 95, 'Var', 20, '2026-09-18')]),
  P(3, 'Domates', 'meyve-sebze', 'kg', [O(2, 28, 'Var', 20, '2026-08-14'), O(6, 33, 'Var', 25, '2026-08-22'), O(8, 30, 'Var', 15, '2026-09-10')]),
  P(4, 'Salatalık', 'meyve-sebze', 'kg', [O(2, 24, 'Var', 20, '2026-08-14')]),
  P(5, 'Sızma Zeytinyağı 5L', 'yag-bakliyat', 'adet', [O(3, 1350, 'Var', 2, '2026-08-15'), O(6, 1420, 'Var', 1, '2026-08-23')]),
  P(6, 'Ayçiçek Yağı 18L', 'yag-bakliyat', 'adet', [O(3, 1180, 'Var', 2, '2026-08-15'), O(6, 1150, 'Var', 1, '2026-08-23')]),
  P(7, 'Kırmızı Mercimek', 'kuru-gida', 'kg', [O(3, 62, 'Var', 25, '2026-08-16'), O(6, 58, 'Var', 50, '2026-08-24'), O(8, 60, 'Sınırlı', 25, '2026-09-12')]),
  P(8, 'Toz Şeker 25kg', 'kuru-gida', 'paket', [O(6, 920, 'Var', 2, '2026-08-24'), O(3, 955, 'Sınırlı', 1, '2026-08-16')]),
  P(9, 'Tam Yağlı Süt', 'sut-urunleri', 'litre', [O(1, 36, 'Var', 50, '2026-08-12'), O(6, 38, 'Var', 100, '2026-08-25')]),
  P(10, 'Beyaz Peynir', 'sut-urunleri', 'kg', [O(1, 245, 'Var', 5, '2026-08-12'), O(6, 238, 'Var', 10, '2026-08-25'), O(8, 242, 'Var', 5, '2026-09-11')]),
  P(11, 'Kola 330ml (24lü)', 'icecek', 'koli', [O(5, 410, 'Var', 5, '2026-08-18')]),
  P(12, 'Karton Bardak (1000lik)', 'ambalaj-sarf', 'koli', [O(4, 560, 'Var', 2, '2026-08-19')]),
  P(13, 'Tavuk Göğsü', 'et-tavuk', 'kg', [O(1, 215, 'Var', 5, '2026-08-26'), O(6, 228, 'Var', 10, '2026-08-27'), O(7, 209, 'Var', 10, '2026-09-20'), O(9, 224, 'Yok', 20, '2026-09-25')]),
  P(14, 'Dana Kıyma', 'et-tavuk', 'kg', [O(1, 520, 'Var', 5, '2026-08-26'), O(6, 545, 'Sınırlı', 10, '2026-08-27'), O(9, 510, 'Var', 20, '2026-09-26')]),
  P(15, 'Patates', 'meyve-sebze', 'kg', [O(2, 18, 'Var', 25, '2026-08-28'), O(6, 21, 'Var', 50, '2026-08-29'), O(8, 19, 'Sınırlı', 25, '2026-09-13')]),
  P(16, 'Ayran', 'sut-urunleri', 'litre', [O(1, 42, 'Var', 30, '2026-08-28'), O(6, 45, 'Var', 50, '2026-08-29')]),
  P(17, 'Peçete', 'ambalaj-sarf', 'koli', [O(4, 310, 'Var', 2, '2026-08-30')]),
  // Aynı ürün farklı BİRİMDE (koli) ayrı karşılaştırma grubudur; kg fiyatlarıyla asla karşılaştırılmaz.
  P(18, 'Beyaz Peynir', 'sut-urunleri', 'koli', [O(1, 2350, 'Var', 2, '2026-09-05'), O(8, 2290, 'Sınırlı', 1, '2026-09-14')])
];
module.exports = { defaultCategories, suppliers, products };
