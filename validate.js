// Ortak, KATI sayı doğrulaması (v9b-2). Backend tüm girişlerin tek yetkilisidir; arayüzdeki min/max yalnızca kullanım kolaylığıdır.
// Kabul: JS sayısı ya da "12,50" / "12.5" biçimli metin; en fazla 2 ondalık (sessiz yuvarlama YOK).
// Ret: negatif, NaN/Infinity, dizi/nesne/boolean/null, "0x10", "1e3", boşluklu/harfli metin ve üst sınırı aşan değerler.
// opts.allowZero: 0 geçerli mi (varsayılan: hayır → değer > 0 olmalı).
const dec = (v, max, opts = {}) => {
  if (typeof v === 'string') { if (!/^\d+(?:[.,]\d{1,2})?$/.test(v.trim())) return null; v = Number(v.trim().replace(',', '.')); }
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (v === 0 && !opts.allowZero) || v > max || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) return null;
  return Math.round(v * 100) / 100;
};
module.exports = { dec };
