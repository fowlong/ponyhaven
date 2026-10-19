import { createServer } from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5174,strictPort:true,hmr:false}});
await server.listen();console.log('Stable QA preview: http://127.0.0.1:5174');
