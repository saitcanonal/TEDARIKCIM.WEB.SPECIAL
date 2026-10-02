// Bağımlılıksız Node.js sunucusu: statik web + JSON REST API (/api/v1) + oturum tabanlı kimlik doğrulama.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const A = require('./auth'), C = require('./catalog'), S = require('./search'), { db, save } = require('./store'), mailer = require('./mailer'), U = require('./uploads');
const PORT = process.env.PORT || 3000, BASE = process.env.BASE_URL || `http://localhost:${PORT}`, PUB = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
class HttpError extends Error { constructor(s, m) { super(m); this.s = s; } }
const bad = (s, m) => { throw new HttpError(s, m); };

const match = (t, q) => !q || t.toLowerCase().includes(q.toLowerCase());

const routes = {};
const prm = [], safe = x => { try { return decodeURIComponent(x); } catch { return x; } };
const route = (m, p, h, opt = {}) => { const full = '/api/v1' + p; if (p.includes(':')) prm.push({ m, seg: full.split('/'), h, ...opt }); else routes[`${m} ${full}`] = { h, ...opt }; };
function find(method, pathname) {
  const hit = routes[`${method} ${pathname}`]; if (hit) return { r: hit, params: {} }; const parts = pathname.split('/');
  for (const x of prm) { if (x.m !== method || x.seg.length !== parts.length) continue; const params = {}; if (x.seg.every((sg, i) => sg[0] === ':' ? (params[sg.slice(1)] = safe(parts[i]), true) : sg === parts[i])) return { r: x, params }; }
  return null;
}
// --- Herkese açık ---
route('GET', '/health', () => ({ status: 'ok' }));
route('GET', '/categories', () => C.activeCats()); // yalnızca AKTİF kategoriler: [{ id, name }]
route('GET', '/units', () => C.UNITS);
const inCat = (ids, names, q) => ids.includes(q) || names.includes(q); // filtre kategori kimliği (ya da adı) ile çalışır
route('GET', '/products', c => C.allProducts().filter(p => match(p.name, c.q.q) && (!c.q.category || inCat([p.categoryId], [p.category], c.q.category))).map(C.withOffers).filter(Boolean));
// v6: sunucu tarafında arama / filtre / sıralama / sayfalama (q, category, city, unit, minPrice, maxPrice, stock, verified, supplier, sort, page, limit)
route('GET', '/offers', c => S.searchOffers(c.q, bad));
route('GET', '/products/:key', c => C.productDetail(c.params.key) || bad(404, 'Ürün bulunamadı.')); // key = "ad~birim" (bkz. catalog.groupKey)
route('GET', '/suppliers/:id', c => C.supplierProfile(c.params.id) || bad(404, 'Tedarikçi bulunamadı.'));
route('GET', '/suppliers', c => C.allSuppliers().filter(x => match(x.name + x.city, c.q.q) && (!c.q.category || inCat(x.categoryIds, x.categories, c.q.category))));

// --- Kimlik doğrulama ---
const session = (c, u) => { c.res.setHeader('Set-Cookie', A.sessionCookie(A.createSession(u.id))); return { user: A.publicUser(u), redirect: A.HOME[u.activeRole] || '/' }; };
route('POST', '/auth/register', async c => {
  if (!A.hit('r|' + c.ip, 20, 36e5)) bad(429, 'Çok fazla deneme. Daha sonra tekrar deneyin.');
  const { name, email, phone, password, userType } = c.body, roles = typeof userType === 'string' ? A.TYPES[userType] : undefined; // tip karışıklığı (dizi/nesne) reddedilir
  if (!A.V.name(name)) bad(400, 'Ad ve soyad girin.'); if (!A.V.email(email)) bad(400, 'Geçerli bir e-posta girin.');
  if (!A.V.phone(phone)) bad(400, 'Geçerli bir telefon numarası girin.'); if (!roles) bad(400, 'Kullanım tipi seçin.');
  if (!A.V.password(password)) bad(400, 'Şifre en az 8 karakter olmalı ve harf ile rakam içermelidir.');
  const em = email.trim().toLowerCase(); if (db.users.some(u => u.email === em)) bad(409, 'Bu e-posta ile kayıtlı bir hesap var.');
  const u = { id: crypto.randomUUID(), name: name.trim(), email: em, phone: phone.replace(/[\s()-]/g, ''), passwordHash: await A.hashPassword(password), roles: [...roles], activeRole: roles[0], createdAt: new Date().toISOString() };
  // Hash hesaplanırken paralel kayıt aynı e-postayı eklemiş olabilir.
  if (db.users.some(x => x.email === em)) bad(409, 'Bu e-posta ile kayıtlı bir hesap var.');
  db.users.push(u); save(); c.status = 201; return session(c, u);
});
route('POST', '/auth/login', async c => {
  const em = String(c.body.email || '').trim().toLowerCase(), key = `l|${c.ip}|${em}`;
  if (A.over(key, 5)) bad(429, 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.');
  const u = db.users.find(x => x.email === em), ok = await A.verifyPassword(String(c.body.password || ''), u ? u.passwordHash : await A.dummyHash());
  if (!u || !ok) { A.hit(key, 5, 9e5); bad(401, 'E-posta veya şifre hatalı.'); }
  if (!A.isActive(u)) bad(403, 'Hesabınız pasif duruma alınmış. Yardım için destek ekibiyle iletişime geçin.'); // şifre doğrulandıktan SONRA söylenir: hesap varlığı şifresiz sızdırılmaz
  A.clear(key); return session(c, u);
});
route('POST', '/auth/logout', c => { const t = A.tokenFromRequest(c.req); if (t) A.destroySession(t); c.res.setHeader('Set-Cookie', A.clearCookie()); return { ok: true }; });
route('GET', '/auth/session', c => ({ user: c.user ? A.publicUser(c.user) : null })); // ziyaretçi için beklenen durum: 200, konsolda 401 yok
route('GET', '/auth/me', c => ({ user: A.publicUser(c.user) }), { auth: true });
route('POST', '/auth/switch-role', c => {
  if (typeof c.body.role !== 'string') bad(400, 'Geçersiz rol.');
  if (!c.user.roles.includes(c.body.role)) bad(403, 'Bu role sahip değilsiniz.');
  c.user.activeRole = c.body.role; save(); return { user: A.publicUser(c.user), redirect: A.HOME[c.body.role] };
}, { auth: true });
route('POST', '/auth/add-role', async c => {
  if (c.user.roles.includes('admin')) bad(403, 'Yönetici hesaplarına rol eklenemez.');
  if (typeof c.body.role !== 'string' || !A.TYPES[c.body.role] || c.body.role === 'both') bad(400, 'Geçersiz rol.'); // yalnızca metin: dizi/nesne roles alanını bozamaz
  if (A.over('a|' + c.user.id, 5)) bad(429, 'Çok fazla deneme.');
  if (!(await A.verifyPassword(String(c.body.password || ''), c.user.passwordHash))) { A.hit('a|' + c.user.id, 5, 9e5); bad(403, 'Şifre hatalı.'); }
  if (!c.user.roles.includes(c.body.role)) c.user.roles.push(c.body.role);
  c.user.activeRole = c.body.role; save(); return { user: A.publicUser(c.user), redirect: A.HOME[c.body.role] };
}, { auth: true });
// Şifre sıfırlama: kullanıcı varlığı sızdırılmaz, token tek kullanımlık ve 30 dk geçerli
route('POST', '/auth/forgot', c => {
  if (!A.hit('f|' + c.ip, 10, 36e5)) bad(429, 'Çok fazla deneme. Daha sonra tekrar deneyin.');
  const u = db.users.find(x => x.email === String(c.body.email || '').trim().toLowerCase());
  if (u && A.isActive(u)) mailer.send(u.email, 'TEDARİKÇİM şifre sıfırlama', `Şifrenizi sıfırlamak için (30 dk geçerli): ${BASE}/sifre-sifirla?token=${A.createReset(u.id)}`);
  return { message: 'E-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi.' };
});
route('POST', '/auth/reset', async c => {
  if (!A.V.password(c.body.password)) bad(400, 'Şifre en az 8 karakter olmalı ve harf ile rakam içermelidir.');
  const r = A.findReset(String(c.body.token || '')); if (!r) bad(400, 'Bağlantı geçersiz veya süresi dolmuş.');
  const hash = await A.hashPassword(c.body.password);
  // Aynı tek kullanımlık token paralel isteklerde yalnızca bir kez tüketilebilir.
  if (A.findReset(String(c.body.token || '')) !== r) bad(400, 'Bağlantı geçersiz veya süresi dolmuş.');
  const u = db.users.find(x => x.id === r.userId); if (!A.isActive(u)) bad(400, 'Bağlantı geçersiz veya süresi dolmuş.');
  u.passwordHash = hash;
  db.resets = db.resets.filter(x => x !== r); A.destroyUserSessions(u.id); save();
  return { message: 'Şifreniz güncellendi. Giriş yapabilirsiniz.' };
});

require('./panel')(route, bad); // müşteri/tedarikçi panel API'leri
require('./requests')(route, bad); // v7: teklif sistemi (müşteri talebi → tedarikçi teklifi)
require('./notify').register(route, bad); // v8: bildirimler
require('./admin')(route, bad); // yönetici API'leri (yalnızca role: 'admin')

// Yetki denetimi için: DUMP_ROUTES=1 ile çalıştırılırsa sunucu başlamaz; kayıtlı tüm rotaları (auth/role bilgisiyle) yazdırıp çıkar.
// authz-test.js bununla "korumasız rota yok" ve "her /customer|/supplier|/admin rotasının rolü var" kurallarını OTOMATİK doğrular (yeni eklenen rota da kapsanır).
if (process.env.DUMP_ROUTES === '1') {
  const all = [...Object.entries(routes).map(([k, v]) => ({ route: k, auth: !!v.auth, role: v.role || null })), ...prm.map(x => ({ route: x.m + ' ' + x.seg.join('/'), auth: !!x.auth, role: x.role || null }))];
  console.log(JSON.stringify(all)); process.exit(0);
}

// --- HTTP katmanı ---
const secHeaders = res => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
};
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const redirect = (res, to) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };
// İstek gövdesini sınırlı okur. Sınır aşılırsa 413 döner ve bağlantı yanıttan sonra kapatılır.
function collect(req, res, max) {
  return new Promise((ok, no) => {
    const tooBig = () => { res.setHeader('Connection', 'close'); no(new HttpError(413, 'İstek çok büyük.')); };
    if (Number(req.headers['content-length']) > max) return tooBig();
    let n = 0, dead = false; const ch = [];
    req.on('data', d => { if (dead) return; n += d.length; if (n > max) { dead = true; tooBig(); } else ch.push(d); });
    req.on('end', () => dead || ok(Buffer.concat(ch))); req.on('error', no);
  });
}
async function readBody(req, res) {
  if (!/^application\/json/.test(req.headers['content-type'] || '')) bad(415, 'JSON gerekli.');
  const buf = await collect(req, res, 10000);
  try { const b = JSON.parse(buf.toString() || '{}'); if (Array.isArray(b)) bad(400, 'Geçersiz istek gövdesi.'); return b && typeof b === 'object' ? b : {}; } catch { bad(400, 'Geçersiz JSON.'); }
}
async function api(req, res, url) {
  const f = find(req.method, url.pathname.replace(/\/$/, '')); if (!f) bad(404, 'Bulunamadı'); const r = f.r;
  const c = { req, res, q: Object.fromEntries(url.searchParams), ip: req.socket.remoteAddress, user: A.userFromRequest(req), status: 200, params: f.params };
  if (req.method !== 'GET') { // CSRF: farklı origin'den gelen istekleri reddet (SameSite=Lax çerezine ek)
    const o = req.headers.origin; if (o) { let h; try { h = new URL(o).host; } catch { } if (h !== req.headers.host) bad(403, 'Geçersiz istek kaynağı.'); }
  }
  // Yetki kontrolü gövde okunmadan ÖNCE yapılır (yetkisiz istekler için büyük gövde okunmaz). Rol hem aktif rol hem de sahip olunan roller üzerinden sunucuda doğrulanır.
  if (r.auth && !c.user) bad(401, 'Giriş yapmanız gerekiyor.');
  if (r.role && (c.user.activeRole !== r.role || !c.user.roles.includes(r.role))) bad(403, 'Bu işlem için yetkiniz yok.');
  if (req.method !== 'GET') {
    if (r.upload) { // ham dosya yükleme (ör. logo): tür beyanı ve boyut burada, içerik doğrulaması işleyicide
      const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase(); if (!r.upload.types.includes(ct)) bad(415, 'Desteklenmeyen dosya türü.');
      c.raw = await collect(req, res, r.upload.max);
    } else c.body = await readBody(req, res);
  }
  const out = await r.h(c); json(res, c.status, out);
}
const PANELS = {
  '/musteri': ['customer', 'musteri.html', ['', '/urun-ara', '/tedarikciler', '/favoriler', '/teklifler', '/mesajlar', '/bildirimler', '/profil']],
  '/admin': ['admin', 'admin.html', ['', '/kullanicilar', '/tedarikciler', '/dogrulama', '/urunler', '/kategoriler']],
  '/tedarikci-paneli': ['supplier', 'tedarikci-paneli.html', ['', '/urunlerim', '/urun-ekle', '/teklifler', '/mesajlar', '/bildirimler', '/firma-profilim', '/dogrulama', '/ayarlar']]
};
const PANEL_FILES = new Set(Object.values(PANELS).map(v => v[1].toLowerCase()));
const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 - Sayfa bulunamadı'); };
function sendFile(res, file, noStore) {
  fs.readFile(file, (err, buf) => { if (err) return notFound(res); res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...(noStore ? { 'Cache-Control': 'no-store' } : {}) }); res.end(buf); });
}
function serve(req, res, url) {
  const p = url.pathname.replace(/\/$/, '') || '/', user = A.userFromRequest(req);
  const root = Object.keys(PANELS).find(r => p === r || p.startsWith(r + '/'));
  if (root) { // sayfa düzeyinde backend yetkilendirme: yalnızca aktif rolün paneli
    const [role, file, subs] = PANELS[root];
    if (!user) return redirect(res, '/giris'); if (user.activeRole !== role) return redirect(res, '/hesap');
    const sub = p.slice(root.length), detail = root === '/admin' && /^\/tedarikci\/[\w-]{1,64}$/.test(sub); // yönetici: tedarikçi detay sayfası
    return subs.includes(sub) || detail ? sendFile(res, path.join(PUB, file), true) : notFound(res);
  }
  if (/^\/urun\/[^/]+$/.test(p)) return sendFile(res, path.join(PUB, 'urun.html')); // ürün detayı: /urun/<ad~birim>
  if (/^\/tedarikci\/[^/]+$/.test(p)) return sendFile(res, path.join(PUB, 'tedarikci.html')); // herkese açık tedarikçi profili
  const lg = /^\/logos\/([^/]+)$/.exec(p); // yüklenen logolar (DATA_DIR/logos); yalnızca rastgele üretilmiş ad biçimi kabul edilir
  if (lg) return U.readLogo(lg[1], (e, buf, type) => { if (e) return notFound(res); res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'Content-Security-Policy': "default-src 'none'" }); res.end(buf); });
  if (p === '/hesap' && !user) return redirect(res, '/giris');
  if ((p === '/giris' || p === '/kayit') && user) return redirect(res, A.HOME[user.activeRole] || '/');
  let file; try { file = path.normalize(path.join(PUB, p === '/' ? 'index.html' : decodeURIComponent(p))); } catch { file = ''; }
  if (!file.startsWith(PUB + path.sep) || file.includes('\0')) return notFound(res);
  // Panel kabuk sayfaları (musteri.html, admin.html, tedarikci-paneli.html) YALNIZCA yukarıdaki rol denetimli yollardan sunulur; doğrudan dosya adıyla (büyük/küçük harf fark etmeksizin) erişilemez.
  if (PANEL_FILES.has(path.basename(file).toLowerCase())) return notFound(res);
  sendFile(res, path.extname(file) ? file : file + '.html', p === '/hesap');
}
http.createServer(async (req, res) => {
  try { secHeaders(res); const url = new URL(req.url, 'http://x'); url.pathname.startsWith('/api/') ? await api(req, res, url) : serve(req, res, url); }
  catch (e) { if (e instanceof HttpError) return json(res, e.s, { error: e.message }); console.error(e); json(res, 500, { error: 'Sunucu hatası' }); }
}).listen(PORT, () => console.log(`TEDARİKÇİM çalışıyor: http://localhost:${PORT}`));
