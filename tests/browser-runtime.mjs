import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
/** Install Playwright separately, or pass PLAYWRIGHT_MODULE for a prepared QA runtime. */
export async function launchBrowser(){
  let playwright;
  try{playwright=await import('playwright');}catch(error){if(!process.env.PLAYWRIGHT_MODULE)throw new Error('浏览器验收需要 Playwright：npm install --no-save playwright，然后 npx playwright install chromium；或设置 PLAYWRIGHT_MODULE。');playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);}
  return playwright.chromium.launch({headless:process.env.GEOBATTLE_QA_HEADED!=='1',executablePath:process.env.PLAYWRIGHT_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage',...(process.env.GEOBATTLE_QA_NATIVE_GPU==='1'?['--use-gl=angle','--use-angle=d3d11','--enable-gpu','--enable-automation']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']),...(process.env.GEOBATTLE_QA_SOFTWARE_CANVAS==='1'?['--disable-accelerated-2d-canvas']:[])]});
}
export const BASE_URL=process.env.GEOBATTLE_TEST_URL||'http://127.0.0.1:4178';
export async function startTestServer(){
  if(process.env.GEOBATTLE_EXTERNAL_SERVER==='1')return ()=>{};
  const port=new URL(BASE_URL).port||4178;
  const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/serve.mjs',import.meta.url)),'--port',String(port),...(process.env.GEOBATTLE_TEST_DIST==='1'?['--dist']:[])],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',()=>resolve());child.once('error',reject);child.once('exit',code=>reject(new Error(`测试服务器提前退出 ${code}`)));});
  return ()=>child.kill('SIGTERM');
}
