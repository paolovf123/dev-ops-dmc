import fs from 'node:fs';const PORT=9333,BASE='http://localhost:5173';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function tg(){const l=await(await fetch(`http://localhost:${PORT}/json`)).json();return l.find(x=>x.type==='page')||l[0];}
let _id=0;function rpc(ws,m,p={}){return new Promise((res,rej)=>{const id=++_id;const on=ev=>{const x=JSON.parse(typeof ev.data==='string'?ev.data:Buffer.from(ev.data).toString());if(x.id===id){ws.removeEventListener('message',on);x.error?rej(new Error(m)):res(x.result);}};ws.addEventListener('message',on);ws.send(JSON.stringify({id,method:m,params:p}));});}
const ev=(ws,e)=>rpc(ws,'Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}).then(r=>r.result&&r.result.value);
const login=`(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms));if(!location.pathname.includes('login'))return 'ok';const sv=(el,v)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};let e,p,t=0;while(t++<60){e=document.querySelector('input[type=email]');p=document.querySelector('input[type=password]');if(e&&p)break;await s(200);}sv(e,'dsshot@local.dev');sv(p,'ShotPass123!');await s(150);document.querySelector('button[type=submit]').click();t=0;while(t++<100){if(!location.pathname.includes('login'))break;await s(200);}await s(1500);return 'logged';})()`;
const t=await tg();const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
await rpc(ws,'Page.enable');await rpc(ws,'Runtime.enable');
await rpc(ws,'Page.navigate',{url:BASE+'/'});await sleep(1800);
if(String(await ev(ws,'location.pathname')).includes('login'))await ev(ws,login);
await ev(ws,`(()=>{window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message));history.pushState({},'','/datasets/7f506384-75ec-4f5b-bfee-60d33d47af7a/new');window.dispatchEvent(new PopStateEvent('popstate'));return 1;})()`);
await sleep(2800);
// llenar inputs: nombre (text), monto (number)
const fill=await ev(ws,`(()=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor((el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
  const inps=[...document.querySelectorAll('.form-shell input, .form-shell textarea, .form-shell select')];
  let nombre=null,monto=null;
  inps.forEach(i=>{const lbl=(i.closest('.form-field')?.innerText||'').toLowerCase();if(lbl.includes('nombre'))nombre=i;if(lbl.includes('monto'))monto=i;});
  if(!nombre||!monto)return 'inputs:'+inps.length+' n='+!!nombre+' m='+!!monto;
  set(nombre,'Registro UI E2E'); set(monto,'777');
  return 'filled';
})()`);
console.log('fill='+fill);
await sleep(400);
const sub=await ev(ws,`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/guardar/i.test(x.textContent||''));if(!b)return 'NO_SAVE';b.click();return 'saved';})()`);
await sleep(2500);
const after=await ev(ws,`JSON.stringify({path:location.pathname,err:(window.__errs||[]).slice(0,3)})`);
console.log('submit='+sub+' '+after);
ws.close();process.exit(0);
