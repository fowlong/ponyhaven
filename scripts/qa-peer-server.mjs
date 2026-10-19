// Isolate PeerServer's internal recurring timers in a disposable QA process.
import { PeerServer } from 'peer';

PeerServer({ port: 19001, path: '/ponyhaven', host: '127.0.0.1' }, () => {
  process.send?.('ready');
});
