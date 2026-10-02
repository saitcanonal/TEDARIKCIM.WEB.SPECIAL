const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('child_process');
const root=path.join(__dirname,'..','dist'), dir=fs.mkdtempSync(path.join(os.tmpdir(),'ted-build-')), env={...process.env,DATA_DIR:dir,PORT:'3143',NODE_ENV:'test',DEMO_PASSWORD:'TestOnly1234'}, B='http://localhost:3143';
assert(fs.existsSync(path.join(root,'build-manifest.json')),'Önce npm run build çalıştırın');
const setup=spawnSync(process.execPath,['scripts/setup-demo.js'],{cwd:root,env,encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);
const srv=spawn(process.execPath,['server/index.js'],{cwd:root,env,stdio:'ignore'});
(async()=>{
 for(let i=0;i<100;i++){try{await fetch(B+'/api/v1/health');break;}catch{await new Promise(r=>setTimeout(r,50));}}
 for(const [email,role,dest] of [['musteri@tedarikcim.test','customer','/musteri'],['tedarikci@tedarikcim.test','supplier','/tedarikci-paneli'],['tedarikci2@tedarikcim.test','supplier','/tedarikci-paneli'],['admin@tedarikcim.test','admin','/admin']]) {
  const r=await fetch(B+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:env.DEMO_PASSWORD})});assert.equal(r.status,200);assert.equal((await r.json()).user.activeRole,role);const cookie=r.headers.getSetCookie()[0].split(';')[0];assert.equal((await fetch(B+dest,{headers:{Cookie:cookie},redirect:'manual'})).status,200);
 }
 const search=await fetch(B+'/api/v1/offers?q=Tavuk&unit=kg');const data=await search.json();assert.equal(data.items.filter(o=>o.supplier.messageable).length,2);
 for(const url of ['/','/css/style.css','/js/app.js','/favicon.svg'])assert.equal((await fetch(B+url)).status,200);
 for(const f of ['/server/index.js','/.env','/data/db.json','/admin.html'])assert.equal((await fetch(B+f)).status,404);
 console.log('BUILD ÇALIŞTIRMA TESTİ GEÇTİ: dağıtım paketi, 4 panel hesabı, arama, statik dosyalar, özel dosya koruması.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{srv.kill();srv.once('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));});
