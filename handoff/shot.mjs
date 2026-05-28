// shot.mjs <route> <outfile> — navega a localhost:5173<route>, loguea si hace falta, y captura screenshot.
// Requiere un chrome headless con --remote-debugging-port=9333 ya corriendo (perfil persistente => cookie de sesión persiste).
import fs from 'node:fs';
const PORT = 9333, BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function target() {
  const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
  return list.find(x => x.type === 'page') || list[0];
}
let _id = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++_id;
    const on = (ev) => {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (m.id === id) { ws.removeEventListener('message', on); m.error ? reject(new Error(method + ' ' + JSON.stringify(m.error))) : resolve(m.result); }
    };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const evalJs = (ws, expression) => rpc(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then(r => r.result && r.result.value);

const loginJs = `(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  if (!location.pathname.includes('login')) { location.href='/login'; await sleep(800); }
  const setVal = (el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  let email,pwd,t=0;
  while(t++<60){ email=document.querySelector('input[type=email]'); pwd=document.querySelector('input[type=password]'); if(email&&pwd) break; await sleep(200);}
  if(!email||!pwd) return 'NO_INPUTS';
  setVal(email,'dsshot@local.dev'); setVal(pwd,'ShotPass123!');
  await sleep(150);
  document.querySelector('button[type=submit]').click();
  t=0; while(t++<100){ if(!location.pathname.includes('login')) break; await sleep(200);}
  await sleep(1500);
  return 'LOGGED:'+location.pathname;
})()`;

async function main() {
  const [route, outfile] = process.argv.slice(2);
  const t = await target();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await rpc(ws, 'Page.enable'); await rpc(ws, 'Runtime.enable');
  // ¿logueado? navega a / y mira si redirige a login
  await rpc(ws, 'Page.navigate', { url: BASE + '/' }); await sleep(1800);
  let path = await evalJs(ws, 'location.pathname');
  if (String(path).includes('login')) { const r = await evalJs(ws, loginJs); console.log('login -> ' + r); }
  // navega a la ruta destino DENTRO del SPA (evita el proxy de Vite para /datasets* etc.)
  await evalJs(ws, `(() => { history.pushState({}, '', ${JSON.stringify(route)}); window.dispatchEvent(new PopStateEvent('popstate')); return location.pathname; })()`);
  await sleep(3000);
  const finalPath = await evalJs(ws, 'location.pathname');
  const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outfile, Buffer.from(shot.data, 'base64'));
  console.log('SHOT ' + route + ' -> ' + outfile + ' (path=' + finalPath + ')');
  ws.close(); process.exit(0);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
