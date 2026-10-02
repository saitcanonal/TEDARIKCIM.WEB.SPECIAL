// E-posta altyapısı. Geliştirmede mesajlar konsola değil data/outbox.jsonl dosyasına yazılır.
// Üretimde bu fonksiyonu SMTP/SES gibi gerçek bir sağlayıcıyla değiştirin.
const fs = require('fs'), path = require('path'), { DIR } = require('./store');
exports.send = (to, subject, text) => {
  if (process.env.NODE_ENV === 'production') return console.warn('[mailer] Üretim e-posta sağlayıcısı yapılandırılmadı:', subject);
  fs.appendFileSync(path.join(DIR, 'outbox.jsonl'), JSON.stringify({ to, subject, text, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
};
