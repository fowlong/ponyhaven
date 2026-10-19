import { createServer } from 'vite';
const server=await createServer({mode:'emulator',define:{'import.meta.env.VITE_COMPANION':'"true"'},server:{host:'127.0.0.1',port:5175,strictPort:true,hmr:false}});
await server.listen();console.log('Sync QA preview: http://127.0.0.1:5175');
