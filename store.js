// Basit JSON dosya deposu (v2). Tüm erişim bu modül üzerinden: ileride SQLite/Postgres ile değiştirilebilir.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { defaultCategories } = require('./data');
const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data'), FILE = path.join(DIR, 'db.json');
fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
for (const k of ['users', 'sessions', 'resets', 'companies', 'products', 'favorites', 'requests', 'conversations', 'audit', 'categories', 'notifications']) db[k] = db[k] || [];
const trl = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr'); // Türkçe duyarlı karşılaştırma anahtarı (İ/ı)
// v3 -> v4 geçişi: eski doğrulama durumları (none/pending/approved) yeni durumlara çevrilir.
const VSTAT = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'], LEGACY = { none: 'UNVERIFIED', pending: 'PENDING', approved: 'VERIFIED', rejected: 'REJECTED' };
for (const co of db.companies) { const v = co.verification = co.verification || {}; v.status = VSTAT.includes(v.status) ? v.status : (Object.hasOwn(LEGACY, v.status) ? LEGACY[v.status] : 'UNVERIFIED'); }
const save = () => { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db), { mode: 0o600 }); fs.renameSync(t, FILE); };

// v4 -> v5 geçişi (idempotent): kategoriler veritabanına taşınır; ürün/firma kategorileri ad yerine KİMLİK ile tutulur;
// eski birimler yeni listeye çevrilir (lt -> litre, çuval -> paket); ürünlere açıklama / minimum sipariş / fiyat tarihi eklenir.
let dirty = false; const stamp = new Date().toISOString();
if (!db.categories.length) { db.categories = defaultCategories.map(c => ({ id: c.id, name: c.name, active: true, createdAt: stamp })); dirty = true; }
const catId = x => { // ad (v4) ya da kimlik (v5) -> kimlik; bilinmeyen ad kaybolmasın diye yeni kategori olarak açılır
  if (db.categories.some(c => c.id === x)) return x;
  let c = db.categories.find(k => trl(k.name) === trl(x));
  if (!c) { c = { id: crypto.randomBytes(6).toString('hex'), name: String(x).trim(), active: true, createdAt: stamp }; db.categories.push(c); dirty = true; }
  return c.id;
};
const UNIT_MAP = { lt: 'litre', 'çuval': 'paket' };
for (const p of db.products) {
  if (!p.categoryId) { p.categoryId = catId(p.category); delete p.category; dirty = true; }
  if (Object.hasOwn(UNIT_MAP, p.unit)) { p.unit = UNIT_MAP[p.unit]; dirty = true; }
  if (typeof p.description !== 'string') { p.description = ''; dirty = true; }
  if (!(p.minQuantity > 0)) { p.minQuantity = 1; dirty = true; }
  if (!p.priceUpdatedAt) { p.priceUpdatedAt = p.createdAt || stamp; dirty = true; }
}
for (const co of db.companies) if (Array.isArray(co.categories) && co.categories.some(x => !db.categories.some(c => c.id === x))) { co.categories = [...new Set(co.categories.map(catId))]; dirty = true; }
for (const q of db.quotes || []) if (Object.hasOwn(UNIT_MAP, q.unit)) { q.unit = UNIT_MAP[q.unit]; dirty = true; }
// v6 -> v7 geçişi (idempotent): v6'daki herkese açık talepler kaldırıldı; yerine tedarikçiye ÖZEL teklif talepleri (db.requests) geldi.
// Eski talebe verilmiş her teklif, o tedarikçiye ait bir talep kaydına çevrilir (sent -> offered, accepted, rejected). Teklifi olmayan açık talepler hedefsiz olduğu için taşınmaz.
// Ham eski kayıtlar silinmez: db.legacyQuotes altında arşivlenir.
if (Array.isArray(db.quotes)) {
  const RMAP = { sent: 'offered', accepted: 'accepted', rejected: 'rejected' }, round2 = n => Math.round(n * 100) / 100;
  for (const q of db.quotes) for (const o of q.offers || []) {
    const co = db.companies.find(c => c.userId === o.supplierId), status = RMAP[o.status] || 'offered';
    db.requests.push({ id: crypto.randomBytes(8).toString('hex'), customerId: q.customerId, supplierId: o.supplierId, companyId: co ? co.id : null, productId: null, productName: q.productName, unit: q.unit, quantity: q.quantity, listPrice: null,
      note: q.note || '', status, createdAt: q.createdAt, updatedAt: o.at || q.createdAt, rejectedBy: status === 'rejected' ? 'customer' : undefined,
      offer: { unitPrice: o.price, totalPrice: round2(o.price * q.quantity), deliveryDays: null, note: o.note || '', at: o.at || q.createdAt } });
  }
  db.legacyQuotes = [...(db.legacyQuotes || []), ...db.quotes]; delete db.quotes; dirty = true;
}
// v7 -> v8 geçişi (idempotent): mesajlara kimlik, alıcı (to) ve okundu (read) alanları eklenir. Eski mesajlar zaten görülmüş sayılır (read: true); alıcı, konuşmanın diğer katılımcısıdır.
for (const cv of db.conversations) for (const m of cv.messages) {
  if (!m.id) { m.id = crypto.randomBytes(6).toString('hex'); dirty = true; }
  if (!m.to) { m.to = m.from === cv.customerId ? cv.supplierId : cv.customerId; dirty = true; }
  if (typeof m.read !== 'boolean') { m.read = true; dirty = true; }
}
// v8 -> v9a geçişi (idempotent): firmalara kayıt tarihi (createdAt) eklenir; eski firmalarda hesap sahibinin kayıt tarihi kullanılır (bilinmiyorsa boş kalır).
for (const co of db.companies) if (!co.createdAt) { const u = db.users.find(x => x.id === co.userId); co.createdAt = (u && u.createdAt) || null; dirty = true; }
// v9a -> v9b1 geçişi (idempotent): rol alanına dizi/nesne gönderilerek bozulmuş hesaplar onarılır (roles yalnızca bilinen metin rollerinden oluşur, activeRole sahip olunan bir rol olur).
const ROLES = ['customer', 'supplier', 'admin'];
for (const u of db.users) {
  const roles = Array.isArray(u.roles) ? [...new Set(u.roles.filter(r => ROLES.includes(r)))] : [];
  if (roles.length && JSON.stringify(roles) !== JSON.stringify(u.roles)) { u.roles = roles; dirty = true; }
  if (roles.length && (typeof u.activeRole !== 'string' || !roles.includes(u.activeRole))) { u.activeRole = roles[0]; dirty = true; }
}
// v9b1 -> v9b2 geçişi (idempotent): vergi numarası metin olmalı; eski sürümde sayı/dizi olarak kaydedilmiş değer metne çevrilir, geçersizse silinir (başvuru yeniden yapılabilsin).
for (const co of db.companies) { const v = co.verification; if (v && v.taxNumber !== undefined && typeof v.taxNumber !== 'string') { const t = String(Array.isArray(v.taxNumber) ? v.taxNumber[0] : v.taxNumber); if (/^\d{10}$/.test(t)) v.taxNumber = t; else delete v.taxNumber; dirty = true; } }
if (dirty) save();

// Denetim kaydı: doğrulama ve kategori kararları, otomatik sıfırlamalar (son 1000 kayıt tutulur).
const audit = e => { db.audit.push({ id: crypto.randomBytes(6).toString('hex'), at: new Date().toISOString(), ...e }); if (db.audit.length > 1000) db.audit.splice(0, db.audit.length - 1000); };
module.exports = { db, save, DIR, audit, VSTAT, trl };
