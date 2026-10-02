// Bildirim sistemi (v8). Bildirimler sunucuda, olayın gerçekleştiği anda üretilir (istemci bildirim üretemez).
//
// Türler:
//   request_new      Yeni teklif talebi      -> tedarikçiye (müşteri teklif istedi)
//   offer_new        Yeni teklif             -> müşteriye   (tedarikçi teklif verdi)
//   offer_accepted   Teklif kabul edildi     -> tedarikçiye (müşteri kabul etti)
//   offer_rejected   Teklif reddedildi       -> tedarikçiye (müşteri reddetti)
//   request_declined Talep reddedildi        -> müşteriye   (tedarikçi talebi geri çevirdi)
//   request_cancelled Talep iptal edildi     -> tedarikçiye (müşteri iptal etti)
//   message_new      Yeni mesaj              -> alıcıya     (aynı konuşmadaki okunmamış mesajlar tek bildirimde toplanır)
//
// GİZLİLİK: her bildirim { userId, role } ile bir kullanıcıya ve onun BİR rolüne aittir. Listeleme, sayaç ve "okundu" işlemleri yalnızca
// oturumdaki kullanıcının ve AKTİF rolünün kayıtlarına uygulanır; başkasının bildirimi için 404 döner. Yanıtlarda kullanıcı kimliği yoktur.
// Tedarikçi ayarları (notifyQuotes / notifyMessages) kapalıysa ilgili bildirimler hiç üretilmez (mesajın kendisi yine gelen kutusuna düşer).
const crypto = require('crypto'), { db, save } = require('./store');
const id = () => crypto.randomBytes(8).toString('hex'), now = () => new Date().toISOString();
const KEEP = 200; // kullanıcı başına saklanan en fazla bildirim
const TYPES = {
  request_new: 'Yeni teklif talebi', offer_new: 'Yeni teklif', offer_accepted: 'Teklif kabul edildi', offer_rejected: 'Teklif reddedildi',
  request_declined: 'Talep reddedildi', request_cancelled: 'Talep iptal edildi', message_new: 'Yeni mesaj'
};
const QUOTE_TYPES = ['request_new', 'offer_accepted', 'offer_rejected', 'request_cancelled'];
const tl = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

function wants(userId, role, type) { // tedarikçi bildirim tercihleri (varsayılan: açık)
  if (role !== 'supplier') return true;
  const u = db.users.find(x => x.id === userId), s = (u && u.supplierSettings) || {};
  if (type === 'message_new') return s.notifyMessages !== false;
  return !QUOTE_TYPES.includes(type) || s.notifyQuotes !== false;
}
// Bildirim üretir. refId: ilgili kayıt (talep / konuşma). Çağıran save() yapar (aynı işlemde tek yazım için bu fonksiyon save etmez).
function push(userId, role, type, text, link, refId) {
  if (!TYPES[type] || !wants(userId, role, type)) return null;
  const t = now();
  if (type === 'message_new') { // aynı konuşmanın okunmamış mesaj bildirimi varsa yenisini açmak yerine güncelle (sayaç + son özet)
    const ex = db.notifications.find(n => n.userId === userId && n.role === role && n.type === type && n.refId === refId && !n.read);
    if (ex) { ex.count = (ex.count || 1) + 1; ex.text = text; ex.at = t; return ex; }
  }
  const n = { id: id(), userId, role, type, text, link, refId: refId || null, count: 1, read: false, at: t };
  db.notifications.push(n);
  const mine = db.notifications.filter(x => x.userId === userId); // eski bildirimleri buda
  if (mine.length > KEEP) { const drop = new Set(mine.sort((a, b) => a.at.localeCompare(b.at)).slice(0, mine.length - KEEP)); db.notifications = db.notifications.filter(x => !drop.has(x)); }
  return n;
}
// Bir konuşmaya ait okunmamış mesaj bildirimini kapatır (konuşma açıldığında).
function readFor(userId, role, type, refId) { for (const n of db.notifications) if (n.userId === userId && n.role === role && n.type === type && n.refId === refId && !n.read) n.read = true; }

const out = n => ({ id: n.id, type: n.type, title: TYPES[n.type] + (n.type === 'message_new' && n.count > 1 ? ` (${n.count})` : ''), text: n.text, link: n.link, read: n.read, at: n.at });
const unreadMessages = (userId, role) => db.conversations.filter(x => x[role === 'customer' ? 'customerId' : 'supplierId'] === userId)
  .reduce((a, x) => a + x.messages.filter(m => m.to === userId && !m.read).length, 0);

function register(route, bad) {
  // Yalnızca müşteri / tedarikçi rolleri; yönetici için bildirim yoktur. Kayıtlar kullanıcı + AKTİF rol ile süzülür.
  const auth = { auth: true };
  const mine = c => { const r = c.user.activeRole; if (!['customer', 'supplier'].includes(r)) bad(403, 'Bu işlem için yetkiniz yok.'); return db.notifications.filter(n => n.userId === c.user.id && n.role === r); };
  route('GET', '/notifications/summary', c => { const m = mine(c); return { notifications: m.filter(n => !n.read).length, messages: unreadMessages(c.user.id, c.user.activeRole) }; }, auth);
  route('GET', '/notifications', c => {
    const all = mine(c).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)), rows = c.q.unread === '1' ? all.filter(n => !n.read) : all;
    const limit = Math.min(50, Math.max(1, parseInt(c.q.limit, 10) || 20)), pages = Math.max(1, Math.ceil(rows.length / limit)), page = Math.min(pages, Math.max(1, parseInt(c.q.page, 10) || 1));
    return { items: rows.slice((page - 1) * limit, page * limit).map(out), total: rows.length, unread: all.filter(n => !n.read).length, page, pages, limit };
  }, auth);
  route('POST', '/notifications/read-all', c => { let k = 0; for (const n of mine(c)) if (!n.read) { n.read = true; k++; } if (k) save(); return { ok: true, updated: k }; }, auth);
  route('POST', '/notifications/:id/read', c => { const n = mine(c).find(x => x.id === c.params.id) || bad(404, 'Bildirim bulunamadı.'); if (!n.read) { n.read = true; save(); } return out(n); }, auth);
}
module.exports = { push, readFor, register, unreadMessages, tl, TYPES };
