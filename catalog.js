// Katalog: örnek (demo) veri + tedarikçi kullanıcıların eklediği gerçek ürün/firmalar birleştirilir.
// Kategoriler db.categories'ten gelir (yönetici yönetir). PASİF kategori: katalogda gizlenir, yeni ürün/firma seçiminde sunulmaz.
const { suppliers, products } = require('./data'), { db, trl } = require('./store');
const UNITS = ['kg', 'adet', 'koli', 'litre', 'paket', 'kasa'];
// Arama anahtarı: Türkçe küçük harf + aksan duyarsız ("Tavuk Göğsü" == "tavuk gogsu"). Karşılaştırma grubu anahtarı: ad + birim (birimler asla karıştırılmaz).
const fold = s => trl(s).replace(/[çğıöşü]/g, c => ({ 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' }[c]));
const groupKey = (name, unit) => trl(name) + '~' + unit;
const catById = id => db.categories.find(c => c.id === id);
const catName = id => (catById(id) || {}).name || '';
const catActive = id => !!(catById(id) || {}).active;
const activeCats = () => db.categories.filter(c => c.active).map(c => ({ id: c.id, name: c.name }));
const vstat = co => (co && co.verification && co.verification.status) || 'UNVERIFIED';
const live = c => { const u = db.users.find(x => x.id === c.userId) || {}; return !!c.name && u.active !== false && u.supplierSettings?.visible !== false; }; // pasif hesap ve gizlenmiş firma katalogda görünmez
const withCats = (s, ids) => { const act = (ids || []).filter(catActive); return { ...s, categoryIds: act, categories: act.map(catName) }; };
const allSuppliers = () => [...suppliers.map(s => withCats(s, s.categoryIds)), ...db.companies.filter(live).map(c => withCats({ id: c.id, name: c.name, city: c.city || '-', district: c.district || '', logo: c.logo ? '/logos/' + c.logo : null, deliveryRegions: c.deliveryRegions || [],
  rating: null, minOrder: c.minOrder || 0, delivery: c.delivery || '-', verified: vstat(c) === 'VERIFIED', description: c.description || '', messageable: true }, c.categories))];
const allProducts = () => {
  const list = products.filter(p => catActive(p.category)).map(p => ({ ...p, id: String(p.id), key: groupKey(p.name, p.unit), categoryId: p.category, category: catName(p.category),
    offers: p.offers.map(o => ({ ...o, id: `d${p.id}-${o.supplierId}`, priceUpdatedAt: o.createdAt })) }));
  for (const d of db.products.filter(x => x.active && catActive(x.categoryId))) { // pasif ürün ve pasif kategori katalogda görünmez
    const co = db.companies.find(c => c.userId === d.ownerId); if (!co || !live(co)) continue;
    const offer = { id: 'u' + d.id, supplierId: co.id, price: d.price, stock: d.stock, minQuantity: d.minQuantity || 1, description: d.description || '', createdAt: d.createdAt, priceUpdatedAt: d.priceUpdatedAt || d.createdAt };
    const key = groupKey(d.name, d.unit), ex = list.find(p => p.key === key);
    ex ? ex.offers.push(offer) : list.push({ id: 'u' + d.id, key, name: d.name, categoryId: d.categoryId, category: catName(d.categoryId), unit: d.unit, offers: [offer] });
  }
  return list;
};
const withOffers = p => {
  const S = allSuppliers();
  const offers = p.offers.map(o => { const s = S.find(x => String(x.id) === String(o.supplierId)); return s && { ...o, supplier: s.name, verified: s.verified }; }).filter(Boolean).sort((a, b) => a.price - b.price);
  return offers.length ? { ...p, offers, bestPrice: offers[0].price, bestSupplier: offers[0].supplier } : null;
};
// Düz teklif listesi (ürün x tedarikçi). Tedarikçi bilgisi yalnızca HERKESE AÇIK alanlardan oluşur (telefon, e-posta, adres, vergi bilgisi yoktur).
const pubSupplier = s => ({ id: s.id, name: s.name, city: s.city, district: s.district || '', logo: s.logo || null, verified: !!s.verified, delivery: s.delivery || '-', minOrder: s.minOrder || 0, messageable: !!s.messageable });
const allOffers = () => {
  const S = new Map(allSuppliers().map(s => [String(s.id), s])), out = [];
  for (const p of allProducts()) for (const o of p.offers) {
    const s = S.get(String(o.supplierId)); if (!s) continue;
    out.push({ id: o.id, key: p.key, productId: p.id, name: p.name, categoryId: p.categoryId, category: p.category, unit: p.unit, price: o.price, minQuantity: o.minQuantity || null, stock: o.stock,
      description: o.description || '', createdAt: o.createdAt || null, priceUpdatedAt: o.priceUpdatedAt || o.createdAt || null, supplier: pubSupplier(s) });
  }
  return out;
};
const inStock = o => o.stock !== 'Yok';
const byPrice = (a, b) => a.price - b.price || String(a.supplier.name).localeCompare(b.supplier.name, 'tr');
// Ürün detayı: aynı ad + birimdeki tüm teklifler. İstatistikler YALNIZCA stokta olan tekliflerden ve tek birimde hesaplanır.
const productDetail = key => {
  const all = allOffers(), offers = all.filter(o => o.key === key).sort(byPrice); if (!offers.length) return null;
  const f = offers[0], ok = offers.filter(inStock), prices = ok.map(o => o.price);
  const others = new Map(); for (const o of all) if (o.key !== key && trl(o.name) === trl(f.name)) { const x = others.get(o.key) || { key: o.key, unit: o.unit, offerCount: 0, minPrice: null }; x.offerCount++; if (inStock(o) && (x.minPrice === null || o.price < x.minPrice)) x.minPrice = o.price; others.set(o.key, x); }
  return { key, productId: f.productId, name: f.name, categoryId: f.categoryId, category: f.category, unit: f.unit, offers: offers.map(o => ({ ...o, isBest: ok.length > 0 && o === ok[0] })),
    stats: { offerCount: offers.length, availableCount: ok.length, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 : null, bestOfferId: ok.length ? ok[0].id : null },
    otherUnits: [...others.values()].sort((a, b) => a.unit.localeCompare(b.unit, 'tr')) };
};
// Herkese açık tedarikçi profili (gizli/pasif tedarikçi bulunamaz).
const supplierProfile = id => {
  const s = allSuppliers().find(x => String(x.id) === String(id)); if (!s) return null;
  return { ...pubSupplier(s), rating: s.rating || null, description: s.description || '', categories: s.categories, deliveryRegions: s.deliveryRegions || [], offerCount: allOffers().filter(o => String(o.supplier.id) === String(s.id)).length };
};
module.exports = { live, fold, groupKey, allOffers, productDetail, supplierProfile, inStock, byPrice, UNITS, catById, catName, catActive, activeCats, vstat, allSuppliers, allProducts, withOffers };
