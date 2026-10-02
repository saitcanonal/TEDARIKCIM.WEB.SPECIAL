// Bağımlılıksız Node + statik web projesi için doğrulanmış dağıtım paketi.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
for (const dir of ['server', 'public', 'scripts']) for (const f of files(path.join(root, dir))) {
  if (f.endsWith('.js')) execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  if (f.endsWith('.html')) {
    const html = fs.readFileSync(f, 'utf8');
    if (!/name="viewport"/.test(html)) throw new Error('viewport eksik: ' + f);
    for (const m of html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css|svg))"/g)) if (!fs.existsSync(path.join(root, 'public', m[1]))) throw new Error('Kırık statik bağlantı: ' + m[1]);
  }
}
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
fs.cpSync(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });
fs.cpSync(path.join(root, 'server'), path.join(out, 'server'), { recursive: true, filter: p => !p.endsWith('-test.js') });
fs.cpSync(path.join(root, 'scripts'), path.join(out, 'scripts'), { recursive: true });
for (const f of ['package.json', 'README.md', 'TEST-REPORT.md', '.env.example', '.gitignore']) fs.copyFileSync(path.join(root, f), path.join(out, f));
const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
pkg.scripts = { start: 'node server/index.js', 'setup:demo': 'node scripts/setup-demo.js', 'create-admin': 'node server/create-admin.js' };
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
const manifest = files(out).map(f => ({ path: path.relative(out, f), bytes: fs.statSync(f).size }));
fs.writeFileSync(path.join(out, 'build-manifest.json'), JSON.stringify({ version: '1.0.0', files: manifest }, null, 2));
console.log('BUILD BAŞARILI: dist/ — ' + manifest.length + ' dosya, kaynak sözdizimi ve statik bağlantılar doğrulandı.');
