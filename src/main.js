import {GameController} from './controller.js';
const root=document.getElementById('app');
try{
  const app=new GameController(root);
  // Readable local diagnostics for reproducible QA; no network, telemetry or remote control.
  Object.defineProperty(window,'geobattle',{value:app,writable:false,configurable:false});
}catch(error){
  console.error(error);
  root.textContent='游戏未能启动。请重新打开离线版，或用 npm run dev 启动项目。错误：'+error.message;
  root.style.cssText='padding:35px;display:block;font:16px/1.8 sans-serif;overflow:auto';
}
