// Logo dosyaları: yalnızca PNG/JPEG/WebP. Tür, istemcinin beyanına değil dosyanın ilk baytlarına (magic bytes) göre belirlenir.
// SVG bilerek kabul edilmez (script içerebilir). Dosyalar DATA_DIR/logos altında rastgele adla saklanır.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { DIR } = require('./store');
const LOGO_DIR = path.join(DIR, 'logos'); fs.mkdirSync(LOGO_DIR, { recursive: true, mode: 0o700 });
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }, MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const MAX_LOGO = 512 * 1024, NAME_RE = /^[a-f0-9]{24}\.(png|jpg|webp)$/;
const sniff = b => {
  if (b.length < 16) return null;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
};
function saveLogo(buf, type) { const name = crypto.randomBytes(12).toString('hex') + '.' + TYPES[type]; fs.writeFileSync(path.join(LOGO_DIR, name), buf, { mode: 0o600 }); return name; }
function removeLogo(name) { if (name && NAME_RE.test(name)) fs.rmSync(path.join(LOGO_DIR, name), { force: true }); }
const readLogo = (name, cb) => NAME_RE.test(name) ? fs.readFile(path.join(LOGO_DIR, name), (e, buf) => cb(e, buf, MIME[name.split('.')[1]])) : cb(new Error('bad name'));
module.exports = { TYPES, MAX_LOGO, NAME_RE, sniff, saveLogo, removeLogo, readLogo };
