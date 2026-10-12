import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.argv.includes('--dist')?'dist':'.');
const portFlag=process.argv.indexOf('--port');
const port=Number(portFlag>=0?process.argv[portFlag+1]:process.env.PORT||4178);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    let path=resolve(root,'.'+pathname);
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);return res.end();}
    if((await stat(path)).isDirectory())path=resolve(path,'index.html');
    const body=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('文件不存在');}
});
server.listen(port,'127.0.0.1',()=>console.log(`GEOBATTLE → http://127.0.0.1:${port} (${root})`));
