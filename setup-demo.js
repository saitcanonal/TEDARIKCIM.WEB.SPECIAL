// Şifre ZIP'te bulunmaz. Yerel deneme hesaplarını yalnızca açık komutla kurar.
if (process.env.NODE_ENV === 'production') { console.error('Demo hesap kurulumu üretimde kapalıdır.'); process.exit(1); }
const crypto = require('crypto'), readline = require('readline');
async function password() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('DEMO_PASSWORD ortam değişkeni gerekli.');
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Test hesaplarının şifresi (en az 8 karakter, harf+rakam): ', s => { rl.close(); console.log(); resolve(s); });
    rl._writeToOutput = () => {};
  });
}
(async () => {
  const pw = await password(), A = require('../server/auth'), { db, save } = require('../server/store');
  if (!A.V.password(pw)) throw new Error('Şifre 8–128 karakter, harf ve rakam içermeli.');
  const specs = [['musteri@tedarikcim.test', 'Saitcan Müşteri', 'customer'], ['tedarikci@tedarikcim.test', 'Demo Tedarikçi', 'supplier'], ['tedarikci2@tedarikcim.test', 'İkinci Tedarikçi', 'supplier'], ['admin@tedarikcim.test', 'Demo Yönetici', 'admin']];
  if (specs.some(([email]) => db.users.some(u => u.email === email))) throw new Error('Demo hesabı zaten var; mevcut hesap veya şifre değiştirilmedi.');
  const stamp = new Date().toISOString(), users = [];
  for (const [email, name, role] of specs) users.push({ id: crypto.randomUUID(), email, name, phone: '05321112233', roles: [role], activeRole: role, active: true, passwordHash: await A.hashPassword(pw), createdAt: stamp });
  db.users.push(...users);
  users.filter(u => u.activeRole === 'supplier').forEach((u, i) => {
    const co = { id: crypto.randomBytes(6).toString('hex'), userId: u.id, name: i ? 'İkinci Demo Gıda' : 'Demo Gıda', contactPerson: u.name, email: u.email, phone: u.phone, city: 'İstanbul', district: 'Gaziosmanpaşa', address: 'Demo adres', deliveryRegions: ['İstanbul'], categories: ['et-tavuk'], delivery: '24 saat', minOrder: 0, description: 'Yerel test firması', createdAt: stamp, verification: { status: 'PENDING', taxNumber: i ? '2222222222' : '1111111111', taxOffice: 'Demo', legalName: 'Demo Gıda Ltd.', submittedAt: stamp } };
    db.companies.push(co);
    db.products.push({ id: crypto.randomBytes(6).toString('hex'), ownerId: u.id, name: 'Tavuk Göğsü', categoryId: 'et-tavuk', unit: 'kg', price: i ? 205 : 195, minQuantity: 1, stock: 'Var', active: true, description: 'Kemiksiz, derisiz', createdAt: stamp, priceUpdatedAt: stamp });
  });
  save(); console.log('Yerel test hesapları hazır (sunucuyu kurulumdan sonra başlatın):'); specs.forEach(([email,,role]) => console.log(role + ': ' + email));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
