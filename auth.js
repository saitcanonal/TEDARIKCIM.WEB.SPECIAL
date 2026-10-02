const crypto = require('crypto'), { promisify } = require('util'), { db, save } = require('./store');
const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 7 * 864e5, RESET_MS = 30 * 6e4;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

// Şifre: scrypt + kullanıcıya özel rastgele salt
async function hashPassword(pw) { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('hex')}$${(await scrypt(pw, salt, 64)).toString('hex')}`; }
async function verifyPassword(pw, stored) {
  const [, s, h] = stored.split('$'); const d = await scrypt(pw, Buffer.from(s, 'hex'), 64);
  return crypto.timingSafeEqual(d, Buffer.from(h, 'hex'));
}
let dummy; const dummyHash = async () => dummy || (dummy = await hashPassword('dummy-password-1')); // zamanlama farkını gizler

const V = {
  name: s => typeof s === 'string' && /^\S+(\s+\S+)+$/.test(s.trim()) && s.trim().length <= 80,
  email: s => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s),
  phone: s => typeof s === 'string' && /^\+?\d{10,15}$/.test(s.replace(/[\s()-]/g, '')),
  password: s => typeof s === 'string' && s.length >= 8 && s.length <= 128 && /[A-Za-z]/.test(s) && /\d/.test(s)
};
// Null-prototype: 'constructor' gibi anahtarlarla rol/tip sızdırılamaz. Kayıtla yalnızca bu tipler seçilebilir; 'admin' burada YOK (yalnızca sunucuda create-admin ile oluşur).
const TYPES = Object.assign(Object.create(null), { customer: ['customer'], supplier: ['supplier'], both: ['customer', 'supplier'] });
const HOME = { customer: '/musteri', supplier: '/tedarikci-paneli', admin: '/admin' };
// Hesap durumu (v9a): yalnızca açıkça active:false olan hesap pasiftir; eski kayıtlar (alan yok) aktif sayılır.
const isActive = u => !!u && u.active !== false;
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, roles: u.roles, activeRole: u.activeRole });

function createSession(userId) {
  const now = Date.now(); db.sessions = db.sessions.filter(s => s.exp > now);
  const t = token(); db.sessions.push({ h: sha(t), userId, exp: now + SESSION_MS }); save(); return t;
}
const cookieOpts = () => `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`;
const sessionCookie = t => `sid=${t}; Max-Age=${SESSION_MS / 1000}; ${cookieOpts()}`;
const clearCookie = () => `sid=; Max-Age=0; ${cookieOpts()}`;
const tokenFromRequest = req => (/(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '') || [])[1];
function userFromRequest(req) {
  const t = tokenFromRequest(req); if (!t) return null;
  const s = db.sessions.find(x => x.h === sha(t)); if (!s || s.exp < Date.now()) return null;
  const u = db.users.find(x => x.id === s.userId); return isActive(u) ? u : null; // pasif hesabın açık oturumu anında geçersizdir
}
const destroySession = t => { db.sessions = db.sessions.filter(s => s.h !== sha(t)); save(); };
const destroyUserSessions = id => { db.sessions = db.sessions.filter(s => s.userId !== id); };

function createReset(userId) {
  db.resets = db.resets.filter(r => r.exp > Date.now() && r.userId !== userId);
  const t = token(); db.resets.push({ h: sha(t), userId, exp: Date.now() + RESET_MS }); save(); return t;
}
const findReset = t => db.resets.find(r => r.h === sha(t) && r.exp > Date.now());

// Basit bellek içi hız sınırlama (çoklu sunucuda Redis vb. gerekir)
const rl = new Map();
const hit = (k, max, win) => { const now = Date.now(); let e = rl.get(k); if (!e || e.reset < now) { e = { n: 0, reset: now + win }; rl.set(k, e); } e.n++; return e.n <= max; };
const over = (k, max) => { const e = rl.get(k); return !!e && e.reset > Date.now() && e.n >= max; };

module.exports = { isActive, hashPassword, verifyPassword, dummyHash, V, TYPES, HOME, publicUser, createSession, sessionCookie, clearCookie, tokenFromRequest,
  userFromRequest, destroySession, destroyUserSessions, createReset, findReset, hit, over, clear: k => rl.delete(k), sha };
