// Yönetici API'leri (v9a: kullanıcılar, tedarikçiler, doğrulama, ürünler, kategoriler). Tüm uç noktalar { auth, role: 'admin' } ile korunur; rol kontrolü index.js'te sunucu tarafında yapılır.
// Yönetici hesabı web'den oluşturulamaz (bkz. create-admin.js). Karar geçmişi db.audit'e yazılır.
const crypto = require('crypto'), { db, save, audit, VSTAT, trl } = require('./store'), C = require('./catalog'), A = require('./auth'), mailer = require('./mailer');
const LABEL = { VERIFIED: 'doğrulandı', REJECTED: 'reddedildi', REVOKED: 'doğrulaması kaldırıldı' };
module.exports = (route, bad) => {
  const adm = (m, p, h) => route(m, '/admin' + p, h, { auth: true, role: 'admin' });
  const row = co => {
    const u = db.users.find(x => x.id === co.userId) || {}, v = co.verification || {};
    return { companyId: co.id, name: co.name, logo: co.logo ? '/logos/' + co.logo : null, city: co.city, district: co.district, address: co.address, description: co.description,
      contactPerson: co.contactPerson, phone: co.phone, email: co.email, categories: (co.categories || []).map(C.catName).filter(Boolean), deliveryRegions: co.deliveryRegions || [],
      owner: { name: u.name, email: u.email, phone: u.phone }, status: C.vstat(co), legalName: v.legalName, taxOffice: v.taxOffice, taxNumber: v.taxNumber,
      submittedAt: v.submittedAt, reviewedAt: v.reviewedAt, rejectReason: v.rejectReason, accountActive: A.isActive(u), createdAt: co.createdAt || null };
  };
  adm('GET', '/dashboard', () => {
    const counts = Object.fromEntries(VSTAT.map(s => [s, db.companies.filter(c => C.vstat(c) === s).length]));
    const off = db.users.filter(u => !A.isActive(u)).length, pOff = db.products.filter(p => !p.active).length;
    return { counts, companies: db.companies.length, users: db.users.length, categories: { active: db.categories.filter(k => k.active).length, inactive: db.categories.filter(k => !k.active).length },
      totals: { users: db.users.length, usersInactive: off, suppliers: db.companies.length, suppliersInactive: db.companies.filter(co => !A.isActive(db.users.find(u => u.id === co.userId))).length, products: db.products.length, productsInactive: pOff },
      recent: db.audit.slice(-8).reverse().map(a => ({ at: a.at, action: a.action, company: a.companyName || a.categoryName || a.userName })) };
  });
  adm('GET', '/verifications', c => {
    const f = String(c.q.status || 'PENDING').toUpperCase(); if (f !== 'ALL' && !VSTAT.includes(f)) bad(400, 'Geçersiz durum filtresi.');
    const list = db.companies.filter(co => f === 'ALL' || C.vstat(co) === f).map(row), t = r => r.submittedAt || '';
    return list.sort((a, b) => f === 'PENDING' ? t(a).localeCompare(t(b)) : t(b).localeCompare(t(a)));
  });
  adm('POST', '/verifications/:id/decision', c => {
    const co = db.companies.find(x => x.id === c.params.id) || bad(404, 'Firma bulunamadı.'), st = C.vstat(co), d = c.body.decision;
    if (!['approve', 'reject'].includes(d)) bad(400, 'Geçersiz karar.');
    let reason;
    if (d === 'approve') { if (st !== 'PENDING') bad(409, 'Yalnızca incelemedeki başvurular onaylanabilir.'); }
    else {
      if (!['PENDING', 'VERIFIED'].includes(st)) bad(409, 'Bu firma için ret/kaldırma işlemi yapılamaz.');
      reason = typeof c.body.reason === 'string' ? c.body.reason.trim() : ''; if (reason.length < 3 || reason.length > 300) bad(400, 'Gerekçe 3-300 karakter olmalıdır.');
    }
    const action = d === 'approve' ? 'VERIFIED' : st === 'VERIFIED' ? 'REVOKED' : 'REJECTED';
    co.verification = { ...co.verification, status: d === 'approve' ? 'VERIFIED' : 'REJECTED', reviewedAt: new Date().toISOString(), reviewedBy: c.user.id, rejectReason: reason };
    audit({ action, adminId: c.user.id, companyId: co.id, companyName: co.name }); save();
    const owner = db.users.find(u => u.id === co.userId);
    if (owner) mailer.send(owner.email, 'TEDARİKÇİM firma doğrulama sonucu', `"${co.name}" firmanız ${LABEL[action]}.` + (reason ? ` Gerekçe: ${reason}` : ''));
    return { status: co.verification.status };
  });
  // ---------- ORTAK YARDIMCILAR (v9a) ----------
  // Sayfalama: limit 1-100 (varsayılan 20); sayfa aralık dışındaysa en yakın geçerli sayfaya çekilir.
  const paged = (rows, q) => {
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20)), pages = Math.max(1, Math.ceil(rows.length / limit)), page = Math.min(pages, Math.max(1, parseInt(q.page, 10) || 1));
    return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, pages, limit };
  };
  const oneOf = (v, list, label) => { if (v && !list.includes(v)) bad(400, `Geçersiz ${label} filtresi.`); return v || ''; };
  const byNew = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
  const userOf = id => db.users.find(u => u.id === id);
  const companyOfUser = id => db.companies.find(c => c.userId === id);

  // ---------- KULLANICILAR ----------
  // Parola hash'i ve oturum bilgisi ASLA döndürülmez. Pasif hesap giriş yapamaz, açık oturumları anında kapanır, firması/ürünleri katalogdan gizlenir.
  const userRow = u => { const co = companyOfUser(u.id); return { id: u.id, name: u.name, email: u.email, phone: u.phone || '', roles: u.roles, activeRole: u.activeRole, active: A.isActive(u), createdAt: u.createdAt || null, company: co ? co.name : null, companyId: co ? co.id : null }; };
  adm('GET', '/users', c => {
    const q = trl(c.q.q), role = oneOf(c.q.role, ['customer', 'supplier', 'admin'], 'rol'), st = oneOf(c.q.status, ['active', 'inactive'], 'durum'), all = db.users.map(userRow);
    const rows = all.filter(u => (!q || trl([u.name, u.email, u.phone].join(' ')).includes(q)) && (!role || u.roles.includes(role)) && (!st || u.active === (st === 'active'))).sort(byNew);
    return { ...paged(rows, c.q), totals: { all: all.length, active: all.filter(u => u.active).length, inactive: all.filter(u => !u.active).length }, me: c.user.id };
  });
  adm('POST', '/users/:id/active', c => {
    const u = userOf(c.params.id) || bad(404, 'Kullanıcı bulunamadı.'); if (typeof c.body.active !== 'boolean') bad(400, 'Geçersiz durum.');
    if (u.id === c.user.id && !c.body.active) bad(409, 'Kendi hesabınızı pasifleştiremezsiniz.'); // yöneticinin kendini sistemden kilitlemesi engellenir
    if (A.isActive(u) !== c.body.active) {
      u.active = c.body.active; if (!u.active) A.destroyUserSessions(u.id); // pasifleşen kullanıcının tüm oturumları kapanır
      audit({ action: u.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', adminId: c.user.id, userId: u.id, userName: u.name }); save();
    }
    return userRow(u);
  });

  // ---------- TEDARİKÇİLER ----------
  const supRow = co => {
    const u = userOf(co.userId), v = co.verification || {};
    return { companyId: co.id, name: co.name, logo: co.logo ? '/logos/' + co.logo : null, contactPerson: co.contactPerson || '', city: co.city || '', district: co.district || '', verification: C.vstat(co),
      accountActive: A.isActive(u), ownerId: u ? u.id : null, ownerName: u ? u.name : '', ownerEmail: u ? u.email : '', productCount: db.products.filter(p => p.ownerId === co.userId).length, createdAt: co.createdAt || null, reviewedAt: v.reviewedAt || null };
  };
  adm('GET', '/suppliers', c => {
    const q = trl(c.q.q), vs = oneOf(String(c.q.verification || '').toUpperCase(), VSTAT, 'doğrulama'), ac = oneOf(c.q.account, ['active', 'inactive'], 'hesap'), all = db.companies.map(supRow);
    const rows = all.filter(r => (!q || trl([r.name, r.contactPerson, r.city, r.ownerName, r.ownerEmail].join(' ')).includes(q)) && (!vs || r.verification === vs) && (!ac || r.accountActive === (ac === 'active'))).sort(byNew);
    return { ...paged(rows, c.q), totals: { all: all.length, active: all.filter(r => r.accountActive).length, inactive: all.filter(r => !r.accountActive).length } };
  });
  adm('GET', '/suppliers/:id', c => {
    const co = db.companies.find(x => x.id === c.params.id) || bad(404, 'Tedarikçi bulunamadı.'), u = userOf(co.userId), me = co.userId, prods = db.products.filter(p => p.ownerId === me), reqs = db.requests.filter(r => r.supplierId === me);
    return { ...row(co), ...supRow(co), owner: { id: u ? u.id : null, name: u ? u.name : '', email: u ? u.email : '', phone: u ? u.phone || '' : '', active: A.isActive(u), createdAt: u ? u.createdAt || null : null, isMe: !!u && u.id === c.user.id },
      stats: { products: prods.length, activeProducts: prods.filter(p => p.active).length, requests: reqs.length, offers: reqs.filter(r => r.offer).length, accepted: reqs.filter(r => r.status === 'accepted').length, conversations: db.conversations.filter(x => x.supplierId === me).length },
      products: prods.sort(byNew).slice(0, 10).map(p => ({ id: p.id, name: p.name, category: C.catName(p.categoryId), price: p.price, unit: p.unit, active: p.active })),
      history: db.audit.filter(a => a.companyId === co.id).slice(-8).reverse().map(a => ({ at: a.at, action: a.action })) };
  });

  // ---------- ÜRÜNLER ----------
  // Yalnızca tedarikçilerin eklediği (db.products) ürünler listelenir; örnek (demo) katalog verisi kod içinde sabittir ve yönetilmez.
  // "listed": ürün müşteriye görünüyor mu; görünmüyorsa nedeni (hiddenReason) açıkça gösterilir.
  const prodRow = p => {
    const co = companyOfUser(p.ownerId), why = !p.active ? 'Ürün pasif' : !C.catActive(p.categoryId) ? 'Kategori pasif' : !co || !C.live(co) ? 'Tedarikçi pasif veya gizli' : '';
    return { id: p.id, name: p.name, supplier: co ? co.name : null, companyId: co ? co.id : null, categoryId: p.categoryId, category: C.catName(p.categoryId) || 'Kategorisiz', categoryActive: C.catActive(p.categoryId),
      price: p.price, unit: p.unit, stock: p.stock, active: p.active, listed: !why, hiddenReason: why, createdAt: p.createdAt || null };
  };
  adm('GET', '/products', c => {
    const q = trl(c.q.q), st = oneOf(c.q.status, ['active', 'inactive'], 'durum'), cat = c.q.category || '', sup = c.q.supplier || '', all = db.products.map(prodRow);
    const rows = all.filter(r => (!q || trl(r.name + ' ' + (r.supplier || '')).includes(q)) && (!cat || r.categoryId === cat) && (!sup || r.companyId === sup) && (!st || r.active === (st === 'active'))).sort(byNew);
    const sc = sup && db.companies.find(x => x.id === sup);
    return { ...paged(rows, c.q), totals: { all: all.length, active: all.filter(r => r.active).length, inactive: all.filter(r => !r.active).length }, supplierName: sc ? sc.name : null };
  });

  // ---------- KATEGORİLER ----------
  // Yönetici kategori ekler / yeniden adlandırır / pasifleştirir (silme yoktur: ürün ve firma bağlantıları korunur).
  // Pasif kategori: katalogda ve filtrelerde görünmez, içindeki ürünler gizlenir, tedarikçiler yeni ürün/firma seçiminde onu seçemez. Aktifleştirince her şey geri gelir.
  const catRow = k => ({ id: k.id, name: k.name, active: k.active, productCount: db.products.filter(p => p.categoryId === k.id).length, createdAt: k.createdAt });
  const catIn = b => { const n = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : ''; if (n.length < 2 || n.length > 50) bad(400, 'Kategori adı 2-50 karakter olmalıdır.'); return n; };
  const taken = (n, self) => db.categories.some(k => k.id !== self && trl(k.name) === trl(n));
  const catOf = c => db.categories.find(k => k.id === c.params.id) || bad(404, 'Kategori bulunamadı.');
  adm('GET', '/categories', () => db.categories.map(catRow));
  adm('POST', '/categories', c => {
    const name = catIn(c.body); if (taken(name)) bad(409, 'Bu adda bir kategori zaten var.');
    const k = { id: crypto.randomBytes(6).toString('hex'), name, active: true, createdAt: new Date().toISOString() }; db.categories.push(k);
    audit({ action: 'CATEGORY_CREATED', adminId: c.user.id, categoryId: k.id, categoryName: k.name }); save(); c.status = 201; return catRow(k);
  });
  adm('PUT', '/categories/:id', c => {
    const k = catOf(c), name = catIn(c.body); if (taken(name, k.id)) bad(409, 'Bu adda bir kategori zaten var.');
    if (name !== k.name) { k.name = name; audit({ action: 'CATEGORY_RENAMED', adminId: c.user.id, categoryId: k.id, categoryName: k.name }); save(); } // ürünler kimlikle bağlı olduğundan yeni ad her yerde anında geçerli olur
    return catRow(k);
  });
  adm('POST', '/categories/:id/active', c => {
    const k = catOf(c); if (typeof c.body.active !== 'boolean') bad(400, 'Geçersiz durum.');
    if (k.active !== c.body.active) { k.active = c.body.active; audit({ action: k.active ? 'CATEGORY_ACTIVATED' : 'CATEGORY_DEACTIVATED', adminId: c.user.id, categoryId: k.id, categoryName: k.name }); save(); }
    return catRow(k);
  });
};
