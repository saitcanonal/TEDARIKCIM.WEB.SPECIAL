// Teklif sistemi (v7): müşteri, katalogdaki BİR tedarikçinin ürünü için miktar + not ile teklif ister; yalnızca o tedarikçi görür ve yanıtlar.
//
// Durumlar (yaşam döngüsü):
//   pending   Bekliyor        müşteri talep etti, tedarikçi henüz yanıtlamadı
//   offered   Teklif Verildi  tedarikçi birim fiyat / toplam / teslimat süresi / not ile teklif verdi
//   accepted  Kabul Edildi    müşteri teklifi kabul etti                       (son durum)
//   rejected  Reddedildi      müşteri teklifi reddetti YA DA tedarikçi talebi geri çevirdi (rejectedBy ile ayrılır) (son durum)
//   cancelled İptal           müşteri talebi/teklifi iptal etti (yalnızca pending/offered)  (son durum)
// Geçişler yalnızca burada, mevcut duruma bakılarak yapılır; tekrar/yarış istekleri 409 alır.
//
// YETKİ (hepsi sunucuda):
//   1) Uç noktalar role: 'customer' / 'supplier' ile kayıtlıdır (index.js: oturum + AKTİF rol + sahip olunan rol kontrolü) -> yanlış rol 403, girişsiz 401.
//   2) Nesne düzeyi: müşteri yalnızca customerId === kendisi, tedarikçi yalnızca supplierId === kendisi olan kayıtlara erişir.
//      Başkasının kaydı için 404 döner (kaydın var olduğu bile sızdırılmaz).
//   3) Kimlik/sahip/durum/tarih alanları istemciden ASLA alınmaz; yalnızca aşağıda adı geçen alanlar okunur. Yanıtlarda kullanıcı kimliği, e-posta, telefon yoktur.
const crypto = require('crypto'), { db, save } = require('./store'), A = require('./auth'), C = require('./catalog'), N = require('./notify');
const id = () => crypto.randomBytes(8).toString('hex'), now = () => new Date().toISOString();
const ST = { pending: 'Bekliyor', offered: 'Teklif Verildi', accepted: 'Kabul Edildi', rejected: 'Reddedildi', cancelled: 'İptal' };
const ACTIVE = ['pending', 'offered'];
const companyOf = uid => db.companies.find(c => c.userId === uid);
const custLabel = uid => { const u = db.users.find(x => x.id === uid) || {}; return (u.profile && u.profile.company) || u.name || 'Müşteri'; };
const strOk = (v, max) => typeof v === 'string' && v.trim().length <= max;
// Kesin sayı ayrıştırma: ortak modül (server/validate.js) — yalnızca sayı veya "12,50" / "12.5" biçimli metin; en fazla 2 ondalık (sessiz yuvarlama yok); dizi/boolean/nesne reddedilir.
const { dec } = require('./validate');
const round2 = n => Math.round(n * 100) / 100;

const offerOut = o => o && { unitPrice: o.unitPrice, totalPrice: o.totalPrice, deliveryDays: o.deliveryDays, note: o.note || '', at: o.at };
const baseOut = r => ({ id: r.id, productName: r.productName, quantity: r.quantity, unit: r.unit, listPrice: r.listPrice, note: r.note || '', status: r.status, statusLabel: ST[r.status],
  createdAt: r.createdAt, updatedAt: r.updatedAt, offer: offerOut(r.offer), rejectedBy: r.rejectedBy, declineNote: r.declineNote || '' });
const customerOut = r => { const co = companyOf(r.supplierId); return { ...baseOut(r), supplier: (co && co.name) || 'Tedarikçi', companyId: (co && co.id) || null }; };
const supplierOut = r => ({ ...baseOut(r), customer: custLabel(r.customerId) });

module.exports = (route, bad) => {
  const cust = (m, p, h) => route(m, '/customer' + p, h, { auth: true, role: 'customer' });
  const supp = (m, p, h) => route(m, '/supplier' + p, h, { auth: true, role: 'supplier' });
  const created = (c, body) => { c.status = 201; return body; };

  // Liste: durum filtresi + sayfalama + durum sayaçları (yalnızca çağıranın kayıtları üzerinden)
  const list = (c, key, out) => {
    const st = c.q.status; if (st && !Object.hasOwn(ST, st)) bad(400, 'Geçersiz durum filtresi.');
    const all = db.requests.filter(r => r[key] === c.user.id), counts = { all: all.length };
    for (const k of Object.keys(ST)) counts[k] = all.filter(r => r.status === k).length;
    const rows = all.filter(r => !st || r.status === st).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const limit = Math.min(100, Math.max(1, parseInt(c.q.limit, 10) || 25)), pages = Math.max(1, Math.ceil(rows.length / limit)), pg = Math.min(pages, Math.max(1, parseInt(c.q.page, 10) || 1));
    return { items: rows.slice((pg - 1) * limit, pg * limit).map(out), total: rows.length, page: pg, pages, limit, counts };
  };
  const mineAsCustomer = c => db.requests.find(r => r.id === c.params.id && r.customerId === c.user.id) || bad(404, 'Teklif talebi bulunamadı.');
  const mineAsSupplier = c => db.requests.find(r => r.id === c.params.id && r.supplierId === c.user.id) || bad(404, 'Teklif talebi bulunamadı.');
  const touch = (r, status) => { r.status = status; r.updatedAt = now(); save(); };

  // Talep edilebilir ürün: yalnızca kayıtlı tedarikçilerin AKTİF ürünleri (demo katalog tedarikçilerinin yanıtlayacak hesabı yoktur).
  const target = (offerId, me) => {
    const p = typeof offerId === 'string' && /^u[0-9a-f]+$/.test(offerId) ? db.products.find(x => 'u' + x.id === offerId) : null;
    if (!p) { if (typeof offerId === 'string' && /^d\d+-\d+$/.test(offerId)) bad(409, 'Bu tedarikçi demo katalogda; teklif talebi yalnızca kayıtlı tedarikçilere gönderilebilir.'); bad(404, 'Ürün bulunamadı.'); }
    const co = companyOf(p.ownerId);
    if (!p.active || !C.catActive(p.categoryId) || !co || !C.live(co)) bad(404, 'Ürün bulunamadı.');
    if (p.ownerId === me) bad(400, 'Kendi ürününüz için teklif isteyemezsiniz.');
    return { p, co };
  };

  // ---------- MÜŞTERİ ----------
  cust('GET', '/request-target/:offerId', c => {
    const { p, co } = target(c.params.offerId, c.user.id);
    return { offerId: 'u' + p.id, productName: p.name, unit: p.unit, listPrice: p.price, minQuantity: p.minQuantity || 1, stock: p.stock, supplier: { companyId: co.id, name: co.name, city: co.city || '', verified: C.vstat(co) === 'VERIFIED' } };
  });
  cust('GET', '/requests', c => list(c, 'customerId', customerOut));
  cust('GET', '/requests/:id', c => customerOut(mineAsCustomer(c)));
  cust('POST', '/requests', c => {
    const b = c.body, { p, co } = target(b.offerId, c.user.id);
    const qty = dec(b.quantity, 1e6); if (!qty) bad(400, 'Geçerli bir miktar girin (en fazla 2 ondalık).');
    if (qty < (p.minQuantity || 1)) bad(400, `Bu ürün için minimum sipariş miktarı ${p.minQuantity || 1} ${p.unit}.`);
    if (b.note != null && b.note !== '' && !strOk(b.note, 500)) bad(400, 'Not en fazla 500 karakter olabilir.');
    if (!A.hit('rq|' + c.user.id, 30, 36e5)) bad(429, 'Çok fazla teklif talebi gönderdiniz. Bir süre sonra tekrar deneyin.');
    const mine = db.requests.filter(r => r.customerId === c.user.id && ACTIVE.includes(r.status));
    if (mine.some(r => r.productId === p.id)) bad(409, 'Bu ürün için bu tedarikçiye açık bir talebiniz zaten var. Önce onu sonuçlandırın veya iptal edin.');
    if (mine.length >= 50) bad(429, 'En fazla 50 açık (Bekliyor / Teklif Verildi) talebiniz olabilir.');
    const t = now(), r = { id: id(), customerId: c.user.id, supplierId: p.ownerId, companyId: co.id, productId: p.id, productName: p.name, unit: p.unit, quantity: qty, listPrice: p.price,
      note: (b.note || '').trim(), status: 'pending', createdAt: t, updatedAt: t, offer: null };
    db.requests.push(r); N.push(p.ownerId, 'supplier', 'request_new', `${custLabel(c.user.id)}: ${r.productName} · ${qty} ${r.unit} için teklif istedi.`, '/tedarikci-paneli/teklifler?durum=pending', r.id); save(); return created(c, customerOut(r));
  });
  cust('POST', '/requests/:id/cancel', c => {
    const r = mineAsCustomer(c); if (!ACTIVE.includes(r.status)) bad(409, 'Bu talep artık iptal edilemez.');
    N.push(r.supplierId, 'supplier', 'request_cancelled', `${custLabel(r.customerId)}: ${r.productName} talebini iptal etti.`, '/tedarikci-paneli/teklifler', r.id); touch(r, 'cancelled'); return customerOut(r);
  });
  cust('POST', '/requests/:id/decision', c => {
    const d = c.body.decision; if (!['accepted', 'rejected'].includes(d)) bad(400, 'Geçersiz karar.');
    const r = mineAsCustomer(c); if (r.status !== 'offered') bad(409, 'Yalnızca teklif verilmiş talepler için karar verilebilir.');
    if (d === 'rejected') r.rejectedBy = 'customer';
    N.push(r.supplierId, 'supplier', d === 'accepted' ? 'offer_accepted' : 'offer_rejected', `${custLabel(r.customerId)}: ${r.productName} teklifinizi ${d === 'accepted' ? 'kabul etti' : 'reddetti'}.`, '/tedarikci-paneli/teklifler', r.id);
    touch(r, d); return customerOut(r);
  });

  // ---------- TEDARİKÇİ ----------
  supp('GET', '/requests', c => list(c, 'supplierId', supplierOut));
  supp('GET', '/requests/:id', c => supplierOut(mineAsSupplier(c)));
  supp('POST', '/requests/:id/offer', c => {
    const r = mineAsSupplier(c), b = c.body; if (r.status !== 'pending') bad(409, r.status === 'cancelled' ? 'Müşteri bu talebi iptal etti.' : 'Bu talebe zaten yanıt verildi veya talep sonuçlandı.');
    const unitPrice = dec(b.unitPrice, 1e7); if (!unitPrice) bad(400, 'Geçerli bir birim fiyat girin (en fazla 2 ondalık).');
    const calc = round2(unitPrice * r.quantity); let totalPrice = calc;
    if (b.totalPrice != null && b.totalPrice !== '') {
      totalPrice = dec(b.totalPrice, 1e10); if (!totalPrice) bad(400, 'Geçerli bir toplam fiyat girin.');
      if (Math.abs(totalPrice - calc) > 0.011) bad(400, `Toplam fiyat, birim fiyat × miktar (${calc}) ile uyuşmuyor.`); // tutarsız teklif kaydedilmez
    }
    if (calc > 1e10) bad(400, 'Toplam tutar çok yüksek.');
    const dd = typeof b.deliveryDays === 'string' && /^\d{1,3}$/.test(b.deliveryDays.trim()) ? Number(b.deliveryDays) : b.deliveryDays;
    if (!Number.isInteger(dd) || dd < 0 || dd > 90) bad(400, 'Teslimat süresi 0-90 gün arasında tam sayı olmalı (0 = aynı gün).');
    if (b.note != null && b.note !== '' && !strOk(b.note, 500)) bad(400, 'Not en fazla 500 karakter olabilir.');
    r.offer = { unitPrice, totalPrice, deliveryDays: dd, note: (b.note || '').trim(), at: now() };
    N.push(r.customerId, 'customer', 'offer_new', `${(companyOf(r.supplierId) || {}).name || 'Tedarikçi'}: ${r.productName} için ${N.tl(totalPrice)} teklif verdi.`, '/musteri/teklifler', r.id);
    touch(r, 'offered'); return created(c, supplierOut(r));
  });
  supp('POST', '/requests/:id/decline', c => {
    const r = mineAsSupplier(c); if (r.status !== 'pending') bad(409, 'Yalnızca bekleyen talepler reddedilebilir.');
    if (c.body.note != null && c.body.note !== '' && !strOk(c.body.note, 500)) bad(400, 'Not en fazla 500 karakter olabilir.');
    r.rejectedBy = 'supplier'; r.declineNote = (c.body.note || '').trim();
    N.push(r.customerId, 'customer', 'request_declined', `${(companyOf(r.supplierId) || {}).name || 'Tedarikçi'}: ${r.productName} talebinizi reddetti.`, '/musteri/teklifler', r.id);
    touch(r, 'rejected'); return supplierOut(r);
  });
};
