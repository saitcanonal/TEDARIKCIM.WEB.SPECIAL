// Müşteri ve tedarikçi panel API'leri. Her uç nokta rol (aktif rol) ve nesne sahipliği açısından yetkilendirilir.
const crypto = require('crypto'), { db, save, audit, trl } = require('./store'), A = require('./auth'), C = require('./catalog'), U = require('./uploads'), N = require('./notify');
const id = () => crypto.randomBytes(6).toString('hex'), now = () => new Date().toISOString();
const str = (v, max, min = 0) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const { dec } = require('./validate'); // katı sayı doğrulaması: negatif/sıfır, dizi, boolean, hex/üstel yazım ve 2 ondalıktan fazlası reddedilir
const STOCK = ['Var', 'Sınırlı', 'Yok'], DELIVERY = ['Aynı gün', '24 saat', '48 saat', '3+ gün'], BTYPE = ['Restoran', 'Kafe', 'Kasap', 'Market', 'Otel', 'Catering', 'Diğer'];
const byDate = (a, b) => (b.createdAt || b.at || '').localeCompare(a.createdAt || a.at || '');
const companyOf = uid => db.companies.find(c => c.userId === uid);
const userOf = uid => db.users.find(u => u.id === uid);
const custLabel = uid => { const u = userOf(uid) || {}; return (u.profile && u.profile.company) || u.name || 'Müşteri'; };

module.exports = (route, bad) => {
  const cust = (m, p, h) => route(m, '/customer' + p, h, { auth: true, role: 'customer' });
  const supp = (m, p, h) => route(m, '/supplier' + p, h, { auth: true, role: 'supplier' });
  const created = (c, body) => { c.status = 201; return body; };

  // ---------- MÜŞTERİ ----------
  cust('GET', '/dashboard', c => {
    const me = c.user.id, mine = db.requests.filter(r => r.customerId === me);
    const latest = mine.filter(r => r.offer).map(r => ({ productName: r.productName, price: r.offer.unitPrice, unit: r.unit, supplier: (companyOf(r.supplierId) || {}).name || 'Tedarikçi', status: r.status, at: r.offer.at }));
    const deals = C.allProducts().map(C.withOffers).filter(p => p && p.offers.length > 1).map(p => ({ ...p, savePct: Math.round((1 - p.bestPrice / p.offers[p.offers.length - 1].price) * 100) })).sort((a, b) => b.savePct - a.savePct).slice(0, 4);
    return { stats: { favorites: db.favorites.filter(f => f.userId === me).length, pendingRequests: mine.filter(r => r.status === 'pending').length, offersAwaiting: mine.filter(r => r.status === 'offered').length, conversations: db.conversations.filter(x => x.customerId === me).length, unreadMessages: N.unreadMessages(me, 'customer') },
      deals, latestOffers: latest.sort(byDate).slice(0, 5), categories: C.activeCats() };
  });
  cust('GET', '/favorites', c => {
    const mine = db.favorites.filter(f => f.userId === c.user.id), ids = { products: mine.filter(f => f.type === 'product').map(f => f.refId), suppliers: mine.filter(f => f.type === 'supplier').map(f => f.refId) };
    return { ids, products: C.allProducts().filter(p => ids.products.includes(p.id)).map(C.withOffers).filter(Boolean), suppliers: C.allSuppliers().filter(s => ids.suppliers.includes(String(s.id))) };
  });
  cust('POST', '/favorites', c => {
    const { type, refId } = c.body, ref = String(refId == null ? '' : refId);
    if (!['product', 'supplier'].includes(type) || !str(ref, 40, 1)) bad(400, 'Geçersiz istek.');
    if (!(type === 'product' ? C.allProducts().some(p => p.id === ref) : C.allSuppliers().some(s => String(s.id) === ref))) bad(404, 'Bulunamadı.');
    const i = db.favorites.findIndex(f => f.userId === c.user.id && f.type === type && f.refId === ref);
    if (i >= 0) db.favorites.splice(i, 1); else db.favorites.push({ userId: c.user.id, type, refId: ref });
    save(); return { favorite: i < 0 };
  });
  cust('GET', '/profile', c => ({ user: A.publicUser(c.user), profile: c.user.profile || {}, businessTypes: BTYPE }));
  cust('PUT', '/profile', c => {
    const b = c.body; if (!A.V.name(b.name)) bad(400, 'Ad ve soyad girin.'); if (!A.V.phone(b.phone)) bad(400, 'Geçerli bir telefon girin.');
    if ((b.company && !str(b.company, 80)) || (b.city && !str(b.city, 60))) bad(400, 'Alanlardan biri çok uzun.'); if (b.businessType && !BTYPE.includes(b.businessType)) bad(400, 'Geçersiz işletme türü.');
    c.user.name = b.name.trim(); c.user.phone = b.phone.replace(/[\s()-]/g, '');
    c.user.profile = { company: (b.company || '').trim(), city: (b.city || '').trim(), businessType: b.businessType || '' }; save(); return { user: A.publicUser(c.user) };
  });

  // ---------- TEDARİKÇİ ----------
  // ÜRÜN SİSTEMİ: her tedarikçi yalnızca kendi ürünlerini görür/değiştirir (ownerId === oturumdaki kullanıcı). Kimlik, sahip ve tarih alanları istemciden ASLA alınmaz.
  const prodOut = p => ({ id: p.id, name: p.name, categoryId: p.categoryId, category: C.catName(p.categoryId), categoryActive: C.catActive(p.categoryId), description: p.description || '', price: p.price, unit: p.unit,
    minQuantity: p.minQuantity || 1, stock: p.stock, active: p.active, priceUpdatedAt: p.priceUpdatedAt || p.createdAt, createdAt: p.createdAt });
  const priceIn = v => dec(v, 1e7) || bad(400, 'Geçerli bir fiyat girin (0\'dan büyük, en fazla 2 ondalık).');
  const prodIn = (b, c, cur) => {
    if (!str(b.name, 100, 2)) bad(400, 'Ürün adı girin (2-100 karakter).');
    if (typeof b.categoryId !== 'string' || !C.catById(b.categoryId)) bad(400, 'Geçerli kategori seçin.');
    if (!C.catActive(b.categoryId) && !(cur && cur.categoryId === b.categoryId)) bad(400, 'Bu kategori pasif. Başka bir kategori seçin.'); // mevcut ürün pasif kategoride kalabilir (ör. yalnızca fiyat güncelleme)
    if (b.description != null && b.description !== '' && !str(b.description, 500)) bad(400, 'Açıklama en fazla 500 karakter olabilir.');
    if (!C.UNITS.includes(b.unit)) bad(400, 'Geçerli birim seçin.');
    const price = priceIn(b.price), minQuantity = b.minQuantity === '' || b.minQuantity == null ? 1 : dec(b.minQuantity, 1e6);
    if (!minQuantity) bad(400, 'Geçerli bir minimum sipariş miktarı girin (0\'dan büyük, en fazla 2 ondalık).');
    if (!STOCK.includes(b.stock)) bad(400, 'Geçerli stok durumu seçin.');
    if (b.active !== undefined && typeof b.active !== 'boolean') bad(400, 'Geçersiz durum.');
    const name = b.name.trim().replace(/\s+/g, ' ');
    if (db.products.some(x => x.ownerId === c.user.id && x !== cur && trl(x.name) === trl(name) && x.unit === b.unit)) bad(409, 'Bu ad ve birimde bir ürününüz zaten var. Mevcut ürünü düzenleyin.');
    return { name, categoryId: b.categoryId, description: (b.description || '').trim(), unit: b.unit, price, minQuantity, stock: b.stock, active: b.active };
  };
  const ownProd = c => db.products.find(p => p.id === c.params.id && p.ownerId === c.user.id) || bad(404, 'Ürün bulunamadı.');
  supp('GET', '/product-meta', () => ({ units: C.UNITS, stocks: STOCK, categories: C.activeCats() }));
  supp('GET', '/products', c => {
    const q = trl(c.q.q), st = c.q.status, all = db.products.filter(p => p.ownerId === c.user.id);
    if (st && !['active', 'inactive'].includes(st)) bad(400, 'Geçersiz durum filtresi.');
    const list = all.filter(p => (!q || trl(p.name).includes(q)) && (!c.q.category || p.categoryId === c.q.category) && (!st || p.active === (st === 'active'))).sort(byDate);
    const limit = Math.min(100, Math.max(1, parseInt(c.q.limit, 10) || 25)), pages = Math.max(1, Math.ceil(list.length / limit)), page = Math.min(pages, Math.max(1, parseInt(c.q.page, 10) || 1));
    return { items: list.slice((page - 1) * limit, page * limit).map(prodOut), total: list.length, page, pages, limit, totals: { all: all.length, active: all.filter(p => p.active).length, inactive: all.filter(p => !p.active).length } };
  });
  supp('GET', '/products/:id', c => prodOut(ownProd(c)));
  supp('POST', '/products', c => {
    // Ürün sayısı sınırı yoktur; yalnızca otomatik/toplu kötüye kullanıma karşı saatlik ekleme hız sınırı vardır.
    if (!A.hit('np|' + c.user.id, 600, 36e5)) bad(429, 'Çok fazla ürün ekleme denemesi. Bir süre sonra tekrar deneyin.');
    const v = prodIn(c.body, c), t = now(), p = { id: id(), ownerId: c.user.id, ...v, active: v.active !== false, createdAt: t, priceUpdatedAt: t };
    db.products.push(p); save(); return created(c, prodOut(p));
  });
  supp('PUT', '/products/:id', c => {
    const p = ownProd(c), v = prodIn(c.body, c, p), t = now();
    if (v.price !== p.price) p.priceUpdatedAt = t;
    Object.assign(p, { ...v, active: v.active === undefined ? p.active : v.active }); save(); return prodOut(p);
  });
  supp('POST', '/products/:id/price', c => { const p = ownProd(c), price = priceIn(c.body.price); if (price !== p.price) { p.price = price; p.priceUpdatedAt = now(); save(); } return prodOut(p); });
  supp('POST', '/products/:id/active', c => { const p = ownProd(c); if (typeof c.body.active !== 'boolean') bad(400, 'Geçersiz durum.'); p.active = c.body.active; save(); return prodOut(p); });
  supp('DELETE', '/products/:id', c => {
    const p = ownProd(c); db.products.splice(db.products.indexOf(p), 1);
    db.favorites = db.favorites.filter(f => !(f.type === 'product' && f.refId === 'u' + p.id)); // silinen ürünün favori kayıtları da temizlenir
    save(); return { ok: true };
  });

  // Firma profili. Doğrulama durumu bu uç noktalardan ASLA değiştirilemez: yalnızca aşağıda listelenen alanlar işlenir.
  const own = co => co && { id: co.id, name: co.name, logo: co.logo ? '/logos/' + co.logo : null, contactPerson: co.contactPerson || '', phone: co.phone || '', email: co.email || '', city: co.city || '', district: co.district || '',
    address: co.address || '', description: co.description || '', deliveryRegions: co.deliveryRegions || [], categories: (co.categories || []).filter(C.catActive), delivery: co.delivery, minOrder: co.minOrder || 0, verificationStatus: C.vstat(co) };
  const norm = x => x.trim().toLocaleLowerCase('tr');
  supp('GET', '/company', c => ({ company: own(companyOf(c.user.id)) || null, categories: C.activeCats(), delivery: DELIVERY }));
  supp('PUT', '/company', c => {
    const b = c.body, email = typeof b.email === 'string' ? b.email.trim() : '';
    if (!str(b.name, 100, 2)) bad(400, 'Firma adı girin.'); if (!str(b.contactPerson, 80, 2)) bad(400, 'Yetkili kişi adını girin.');
    if (!A.V.phone(b.phone)) bad(400, 'Geçerli bir telefon numarası girin.'); if (!A.V.email(email)) bad(400, 'Geçerli bir e-posta girin.');
    if (!str(b.city, 60, 2)) bad(400, 'Şehir girin.'); if (!str(b.district, 60, 2)) bad(400, 'İlçe girin.'); if (!str(b.address, 250, 5)) bad(400, 'Adres girin (en az 5, en fazla 250 karakter).');
    if (!Array.isArray(b.deliveryRegions) || !b.deliveryRegions.length || b.deliveryRegions.length > 20 || !b.deliveryRegions.every(x => str(x, 60, 2))) bad(400, 'En az bir (en fazla 20) teslimat bölgesi girin.');
    if (!Array.isArray(b.categories) || !b.categories.length || !b.categories.every(x => typeof x === 'string' && C.catActive(x))) bad(400, 'En az bir (aktif) kategori seçin.');
    if (b.description && !str(b.description, 600)) bad(400, 'Açıklama en fazla 600 karakter olabilir.'); if (!DELIVERY.includes(b.delivery)) bad(400, 'Teslimat süresi seçin.');
    const min = b.minOrder === '' || b.minOrder == null ? 0 : dec(b.minOrder, 1e7, { allowZero: true }); if (min === null) bad(400, 'Geçersiz minimum sipariş tutarı (negatif olamaz, en fazla 2 ondalık).');
    let co = companyOf(c.user.id), reset = false; if (!co) { co = { id: id(), userId: c.user.id, createdAt: now(), verification: { status: 'UNVERIFIED' } }; db.companies.push(co); }
    // Kimliği taşıyan alan (firma adı) doğrulanmış firmada değişirse rozet yönetici onayı olmadan korunmaz: yeniden incelemeye alınır.
    if (C.vstat(co) === 'VERIFIED' && co.name && norm(co.name) !== norm(b.name)) {
      co.verification = { ...co.verification, status: 'PENDING', submittedAt: now(), reviewedAt: undefined, reviewedBy: undefined, rejectReason: undefined }; reset = true;
      audit({ action: 'RESET', companyId: co.id, companyName: b.name.trim() });
    }
    Object.assign(co, { name: b.name.trim(), contactPerson: b.contactPerson.trim(), phone: b.phone.replace(/[\s()-]/g, ''), email: email.toLowerCase(), city: b.city.trim(), district: b.district.trim(), address: b.address.trim(),
      deliveryRegions: [...new Set(b.deliveryRegions.map(x => x.trim()))], categories: [...new Set(b.categories)], description: (b.description || '').trim(), delivery: b.delivery, minOrder: min });
    save(); return { company: own(co), verificationReset: reset };
  });
  const LOGO = { auth: true, role: 'supplier' };
  route('POST', '/supplier/company/logo', c => {
    const co = companyOf(c.user.id); if (!co) bad(409, 'Logo yüklemeden önce firma profilinizi kaydedin.');
    if (!A.hit('u|' + c.user.id, 20, 36e5)) bad(429, 'Çok fazla yükleme denemesi. Daha sonra tekrar deneyin.');
    const real = U.sniff(c.raw), declared = (c.req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!real || real !== declared) bad(400, 'Geçersiz görsel dosyası. PNG, JPEG veya WebP yükleyin.');
    const old = co.logo; co.logo = U.saveLogo(c.raw, real); save(); U.removeLogo(old); return { logo: '/logos/' + co.logo };
  }, { ...LOGO, upload: { max: U.MAX_LOGO, types: Object.keys(U.TYPES) } });
  route('DELETE', '/supplier/company/logo', c => { const co = companyOf(c.user.id); if (co && co.logo) { U.removeLogo(co.logo); co.logo = undefined; save(); } return { ok: true }; }, LOGO);

  // Doğrulama: tedarikçi yalnızca BAŞVURABİLİR (UNVERIFIED/REJECTED -> PENDING). VERIFIED/REJECTED kararı yalnızca yönetici API'sindedir (admin.js).
  supp('GET', '/verification', c => {
    const co = companyOf(c.user.id), v = (co && co.verification) || {};
    return { hasCompany: !!co, status: C.vstat(co), legalName: v.legalName, taxOffice: v.taxOffice, taxNumber: v.taxNumber && '*******' + String(v.taxNumber).slice(-3), submittedAt: v.submittedAt, reviewedAt: v.reviewedAt, rejectReason: v.rejectReason };
  });
  supp('POST', '/verification', c => {
    const co = companyOf(c.user.id); if (!co) bad(409, 'Önce firma profilinizi oluşturun.');
    const st = C.vstat(co); if (st === 'PENDING' || st === 'VERIFIED') bad(409, 'Başvurunuz zaten ' + (st === 'VERIFIED' ? 'onaylı.' : 'inceleniyor.'));
    const b = c.body; if (typeof b.taxNumber !== 'string' || !/^\d{10}$/.test(b.taxNumber)) bad(400, 'Vergi numarası 10 haneli olmalıdır.'); // yalnızca metin: sayı/dizi kabul edilirse kayıt bozulur
    if (!str(b.taxOffice, 60, 2)) bad(400, 'Vergi dairesini girin.'); if (!str(b.legalName, 120, 3)) bad(400, 'Ticari unvanı girin.');
    if (db.companies.some(x => x !== co && x.verification && x.verification.taxNumber === b.taxNumber && ['PENDING', 'VERIFIED'].includes(C.vstat(x)))) bad(409, 'Bu vergi numarası ile başka bir firma başvurmuş veya doğrulanmış. Destek ile iletişime geçin.');
    co.verification = { status: 'PENDING', taxNumber: b.taxNumber, taxOffice: b.taxOffice.trim(), legalName: b.legalName.trim(), submittedAt: now() }; // gövdedeki status vb. alanlar yok sayılır
    audit({ action: 'SUBMITTED', companyId: co.id, companyName: co.name }); save(); return { status: 'PENDING' };
  });
  const sset = u => ({ visible: true, notifyQuotes: true, notifyMessages: true, ...(u.supplierSettings || {}) });
  supp('GET', '/settings', c => sset(c.user));
  supp('PUT', '/settings', c => { const s = sset(c.user); for (const k of Object.keys(s)) if (typeof c.body[k] === 'boolean') s[k] = c.body[k]; c.user.supplierSettings = s; save(); return s; });
  supp('GET', '/dashboard', c => {
    const me = c.user.id, co = companyOf(me), prods = db.products.filter(p => p.ownerId === me), inbox = db.requests.filter(r => r.supplierId === me), st = C.vstat(co);
    const pending = inbox.filter(r => r.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { stats: { activeProducts: prods.filter(p => p.active).length, pendingRequests: pending.length, sentOffers: inbox.filter(r => r.offer).length, acceptedOffers: inbox.filter(r => r.status === 'accepted').length, conversations: db.conversations.filter(x => x.supplierId === me).length, unreadMessages: N.unreadMessages(me, 'supplier') },
      pending: pending.slice(0, 5).map(r => ({ id: r.id, productName: r.productName, quantity: r.quantity, unit: r.unit, note: r.note, customer: custLabel(r.customerId), createdAt: r.createdAt })),
      verification: st, checklist: { company: !!co, products: prods.length > 0, verification: st === 'PENDING' || st === 'VERIFIED' } };
  });

  // ---------- MESAJLAR (iki rol için ortak, katılımcı kontrollü) ----------
  // Mesaj: { id, from, to, text, at, read }. GÖNDEREN oturumdan, ALICI konuşmanın diğer katılımcısından sunucuda türetilir (istemci from/to/read/at gönderemez).
  // Bir konuşmayı yalnızca iki katılımcısı görebilir; başkasının konuşması için 404 döner. Yanıtlarda kullanıcı kimliği yoktur.
  for (const role of ['customer', 'supplier']) {
    const me = role === 'customer' ? 'customerId' : 'supplierId', other = role === 'customer' ? 'supplierId' : 'customerId', reg = (m, p, h) => route(m, `/${role}/conversations${p}`, h, { auth: true, role });
    const label = (x, side = role) => side === 'customer' ? (companyOf(x.supplierId) || {}).name || 'Tedarikçi' : custLabel(x.customerId);
    const mineConv = c => db.conversations.find(x => x.id === c.params.id && x[me] === c.user.id) || bad(404, 'Konuşma bulunamadı.');
    const text = c => { const t = c.body.text; if (typeof t !== 'string' || !str(t, 1000, 1)) bad(400, 'Mesaj 1-1000 karakter olmalıdır.'); if (!A.hit('m|' + c.user.id, 60, 6e4)) bad(429, 'Çok hızlı mesaj gönderiyorsunuz.'); return t.trim(); };
    const base = role === 'customer' ? '/musteri' : '/tedarikci-paneli';
    // Mesajı ekler, alıcıya "Yeni mesaj" bildirimi üretir. to = konuşmanın diğer katılımcısı (istemciden alınmaz).
    const send = (x, c, t) => {
      const m = { id: id(), from: c.user.id, to: x[other], text: t, at: now(), read: false }; x.messages.push(m);
      const toRole = role === 'customer' ? 'supplier' : 'customer', rb = toRole === 'customer' ? '/musteri' : '/tedarikci-paneli';
      N.push(m.to, toRole, 'message_new', `${label(x, role)}: ${t.length > 80 ? t.slice(0, 80) + '…' : t}`, `${rb}/mesajlar?konusma=${x.id}`, x.id);
      return m;
    };
    reg('GET', '', c => db.conversations.filter(x => x[me] === c.user.id).map(x => {
      const l = x.messages[x.messages.length - 1];
      return { id: x.id, with: label(x), companyId: (companyOf(x.supplierId) || {}).id, last: l.text.slice(0, 60), lastMine: l.from === c.user.id, at: l.at, unread: x.messages.filter(m => m.to === c.user.id && !m.read).length };
    }).sort((a, b) => b.at.localeCompare(a.at)));
    reg('GET', '/:id', c => { const x = mineConv(c); return { id: x.id, with: label(x), unread: x.messages.filter(m => m.to === c.user.id && !m.read).length, messages: x.messages.map(m => ({ id: m.id, mine: m.from === c.user.id, text: m.text, at: m.at, read: !!m.read })) }; });
    // Okundu işaretleme: yalnızca KENDİNE gelen mesajlar (to === ben) okundu olur; kendi gönderdiğiniz mesajların durumunu değiştiremezsiniz.
    reg('POST', '/:id/read', c => {
      const x = mineConv(c); let k = 0, t = now();
      for (const m of x.messages) if (m.to === c.user.id && !m.read) { m.read = true; m.readAt = t; k++; }
      N.readFor(c.user.id, role, 'message_new', x.id); if (k) save(); return { ok: true, updated: k };
    });
    reg('POST', '/:id/messages', c => { const x = mineConv(c), m = send(x, c, text(c)); save(); return created(c, { id: m.id, at: m.at }); });
    if (role === 'customer') reg('POST', '', c => {
      const co = db.companies.find(k => k.id === String(c.body.companyId)); if (!co || co.userId === c.user.id || !C.live(co)) bad(404, 'Tedarikçi bulunamadı.');
      const t = text(c); let x = db.conversations.find(k => k.customerId === c.user.id && k.supplierId === co.userId);
      if (!x) { x = { id: id(), customerId: c.user.id, supplierId: co.userId, messages: [] }; db.conversations.push(x); }
      send(x, c, t); save(); return created(c, { id: x.id });
    });
  }
};
