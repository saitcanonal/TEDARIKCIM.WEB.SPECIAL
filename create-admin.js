// Yönetici hesabı oluşturma (yalnızca sunucuda, komut satırından). Web üzerinden yönetici oluşturmanın yolu YOKTUR.
//   ADMIN_PASSWORD='...' node server/create-admin.js yonetici@firma.com "Ad Soyad"      (veya şifre için etkileşimli istem)
// Aynı DATA_DIR kullanılmalıdır. Sunucu çalışıyorsa, hesabın tanınması için sunucuyu yeniden başlatın.
const crypto = require('crypto'), readline = require('readline'), { db, save } = require('./store'), A = require('./auth');
async function ask() {
  return new Promise(ok => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); const w = rl._writeToOutput;
    rl.question('Şifre (en az 8 karakter, harf+rakam): ', v => { rl._writeToOutput = w; rl.close(); console.log(); ok(v); }); rl._writeToOutput = s => { if (s.includes('Şifre')) w.call(rl, s); }; });
}
(async () => {
  const [email, name] = [String(process.argv[2] || '').trim().toLowerCase(), String(process.argv[3] || 'Yönetici').trim()];
  if (!A.V.email(email)) { console.error('Kullanım: node server/create-admin.js <e-posta> ["Ad Soyad"]'); process.exit(1); }
  const password = process.env.ADMIN_PASSWORD || await ask();
  if (!A.V.password(password)) { console.error('Şifre en az 8 karakter olmalı ve harf ile rakam içermelidir.'); process.exit(1); }
  if (db.users.some(u => u.email === email)) { console.error('Bu e-posta ile zaten bir hesap var. Yönetici için ayrı, yeni bir e-posta kullanın.'); process.exit(1); }
  db.users.push({ id: crypto.randomUUID(), name, email, phone: '', passwordHash: await A.hashPassword(password), roles: ['admin'], activeRole: 'admin', createdAt: new Date().toISOString() });
  save(); console.log(`Yönetici oluşturuldu: ${email}`);
})();
