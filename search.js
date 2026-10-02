// Teklif arama: ürün x tedarikçi tekliflerini SUNUCUDA arar, süzer, sıralar ve sayfalar (istemciye yalnızca bir sayfa gider).
// Tüm sorgu mantığı bu dosyadadır: JSON deposu yerine SQL kullanıldığında yalnızca C.allOffers() ve aşağıdaki süzme/sıralama
// adımları (WHERE / ORDER BY / LIMIT) veritabanına taşınır; API sözleşmesi aynı kalır.
//
// BİRİM KURALI: teklifler "ürün adı + birim" karşılaştırma gruplarına ayrılır. Fiyat sıralaması yalnızca AYNI grup (aynı birim) içinde
// yapılır; kg fiyatı ile koli fiyatı hiçbir zaman birbiriyle sıralanmaz, en düşük/en yüksek hesabına katılmaz.
const C = require('./catalog');
const SORTS = ['cheapest', 'expensive', 'newest', 'name'];
const STOCKS = { var: ['Var'], sinirli: ['Sınırlı'], yok: ['Yok'], mevcut: ['Var', 'Sınırlı'] };
const STOCK_RANK = { Var: 0, 'Sınırlı': 1, Yok: 2 };
const tr = (a, b) => String(a).localeCompare(String(b), 'tr');
const cmpStr = (x, y) => x < y ? -1 : x > y ? 1 : 0; // ISO tarih metinleri düz karşılaştırılır
const cmpNewest = (a, b) => cmpStr(String(b.createdAt || ''), String(a.createdAt || ''));

function parse(q, bad) {
  const text = s => { const v = String(s == null ? '' : s).trim(); if (v.length > 100) bad(400, 'Arama ve filtre değerleri en fazla 100 karakter olabilir.'); return v; };
  const price = (v, label) => { if (v == null || String(v).trim() === '') return null; const s = String(v).trim(); if (!/^\d+(?:[.,]\d+)?$/.test(s)) bad(400, `${label} geçerli bir sayı olmalı.`); const n = Number(s.replace(',', '.')); if (!Number.isFinite(n) || n > 1e7) bad(400, `${label} geçerli bir sayı olmalı.`); return n; };
  const f = { q: text(q.q), category: text(q.category), city: C.fold(text(q.city)), supplier: text(q.supplier), unit: text(q.unit), sort: q.sort ? String(q.sort) : 'cheapest',
    stock: q.stock ? String(q.stock) : '', verified: ['1', 'true'].includes(String(q.verified || '')), min: price(q.minPrice, 'En düşük fiyat'), max: price(q.maxPrice, 'En yüksek fiyat') };
  if (!SORTS.includes(f.sort)) bad(400, 'Geçersiz sıralama.');
  if (f.stock && !Object.hasOwn(STOCKS, f.stock)) bad(400, 'Geçersiz stok filtresi.');
  if (f.unit && !C.UNITS.includes(f.unit)) bad(400, 'Geçersiz birim.');
  if (f.min != null && f.max != null && f.min > f.max) bad(400, 'En düşük fiyat, en yüksek fiyattan büyük olamaz.');
  f.tokens = C.fold(f.q).split(' ').filter(Boolean).slice(0, 6);
  f.limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || 20)); f.page = Math.max(1, parseInt(q.page, 10) || 1);
  return f;
}

// skip: kendi filtresini hariç tutarak sayım (çok yönlü arama: kategori seçiliyken diğer kategoriler de görünür)
const pass = (o, f, skip) =>
  (skip === 'category' || !f.category || o.categoryId === f.category) && (skip === 'city' || !f.city || o._city === f.city) && (skip === 'unit' || !f.unit || o.unit === f.unit) &&
  (!f.stock || STOCKS[f.stock].includes(o.stock)) && (!f.verified || o.supplier.verified) && (f.min == null || o.price >= f.min) && (f.max == null || o.price <= f.max);
const count = (list, pick) => { const m = new Map(); for (const o of list) { const [k, label] = pick(o); const x = m.get(k) || { value: k, label, count: 0 }; x.count++; m.set(k, x); } return [...m.values()].sort((a, b) => tr(a.label, b.label)); };

const relevance = (nameFold, f) => { const nq = C.fold(f.q); if (!nq) return 0; return nameFold === nq ? 4 : nameFold.startsWith(nq) ? 3 : nameFold.includes(nq) ? 2 : f.tokens.every(t => nameFold.includes(t)) ? 1 : 0; };
const offerSort = {
  cheapest: (a, b) => a.price - b.price || STOCK_RANK[a.stock] - STOCK_RANK[b.stock] || cmpNewest(a, b) || tr(a.supplier.name, b.supplier.name),
  expensive: (a, b) => b.price - a.price || STOCK_RANK[a.stock] - STOCK_RANK[b.stock] || cmpNewest(a, b) || tr(a.supplier.name, b.supplier.name),
  newest: (a, b) => cmpNewest(a, b) || a.price - b.price || tr(a.supplier.name, b.supplier.name),
  name: (a, b) => tr(a.supplier.name, b.supplier.name) || a.price - b.price
};

function searchOffers(query, bad) {
  const f = parse(query, bad);
  const all = C.allOffers().map(o => ({ ...o, _city: C.fold(o.supplier.city), _name: C.fold(o.name), _hay: C.fold(`${o.name} ${o.category} ${o.supplier.name}`) }));
  const base = all.filter(o => f.tokens.every(t => o._hay.includes(t)) && (!f.supplier || String(o.supplier.id) === f.supplier));
  const hits = base.filter(o => pass(o, f));

  // Karşılaştırma grupları (ürün adı + birim)
  const groups = new Map();
  for (const o of hits) { let g = groups.get(o.key); if (!g) groups.set(o.key, g = { key: o.key, name: o.name, unit: o.unit, categoryId: o.categoryId, category: o.category, productId: o.productId, rel: relevance(o._name, f), offers: [] }); g.offers.push(o); }
  const ordered = [...groups.values()];
  for (const g of ordered) {
    g.offers.sort(offerSort[f.sort]);
    const ok = g.offers.filter(C.inStock).sort(C.byPrice); // "en uygun" yalnızca stokta olan tekliften seçilir
    g.best = ok[0] || null; g.minPrice = ok.length ? ok[0].price : null; g.maxPrice = ok.length ? ok[ok.length - 1].price : null; g.newest = g.offers.reduce((m, o) => (o.createdAt || '') > m ? o.createdAt || '' : m, '');
  }
  ordered.sort((a, b) => b.rel - a.rel || (f.sort === 'newest' ? cmpStr(String(b.newest), String(a.newest)) : 0) || tr(a.name, b.name) || tr(a.unit, b.unit));

  // "En yeni": tarih birimden bağımsızdır, bu yüzden düz (gruplanmamış) liste: en yeni teklifler en üstte. Diğer sıralamalar ürün+birim gruplarında yapılır.
  const flat = []; if (f.sort === 'newest') for (const o of [...hits].sort(offerSort.newest)) flat.push({ o, g: groups.get(o.key), rank: 0 }); else for (const g of ordered) g.offers.forEach((o, i) => flat.push({ o, g, rank: i }));
  const total = flat.length, pages = Math.max(1, Math.ceil(total / f.limit)), page = Math.min(f.page, pages), slice = flat.slice((page - 1) * f.limit, page * f.limit);
  const groupsOut = {}, items = slice.map(({ o, g, rank }) => {
    groupsOut[g.key] = { key: g.key, name: g.name, unit: g.unit, category: g.category, productId: g.productId, offerCount: g.offers.length, availableCount: g.offers.filter(C.inStock).length, minPrice: g.minPrice, maxPrice: g.maxPrice, bestOfferId: g.best ? g.best.id : null };
    const { _city, _name, _hay, ...pub } = o; return { ...pub, rank, isBest: !!g.best && g.best.id === o.id };
  });
  const units = [...new Set(hits.map(o => o.unit))];
  return {
    items, total, page, pages, limit: f.limit, groupCount: ordered.length, groups: groupsOut,
    facets: { categories: count(base.filter(o => pass(o, f, 'category')), o => [o.categoryId, o.category]), cities: count(base.filter(o => pass(o, f, 'city')), o => [o._city, o.supplier.city]), units: count(base.filter(o => pass(o, f, 'unit')), o => [o.unit, o.unit]) },
    meta: { units, mixedUnits: units.length > 1, priceFilter: f.min != null || f.max != null, sort: f.sort, layout: f.sort === 'newest' ? 'flat' : 'grouped' }
  };
}
module.exports = { searchOffers, SORTS, STOCKS };
