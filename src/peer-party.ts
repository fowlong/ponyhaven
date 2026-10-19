import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { desktop, desktopProfile, type ArcadeGame } from './desktop';
import type { MeadowRoom, Presence } from './types';

const validCode = (s: string) => /^[A-Z2-9]{8}$/.test(s);
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code() { return [...crypto.getRandomValues(new Uint8Array(8))].map((n)=>alphabet[n%32]).join(''); }
function presence(value: unknown): value is Presence {
  const p=value as Presence;
  return !!p && typeof p.uid==='string' && p.uid.length<=100 && typeof p.name==='string' && p.name.length<=24 &&
    typeof p.ponyId==='string' && p.ponyId.length<=100 && typeof p.rarity==='string' && p.rarity.length<=10 &&
    Number.isInteger(p.tier) && p.tier>=0 && p.tier<=7 && Number.isFinite(p.x) && p.x>=0 && p.x<=100;
}
function validRoom(r: MeadowRoom) {
  return r && validCode(r.code) && typeof r.hostUid==='string' && typeof r.hostName==='string' && r.hostName.length<=24 &&
    typeof r.background==='string' && r.background.length<160 && typeof r.customBackground==='string' && r.customBackground.length<480000 &&
    (!r.customBackground || /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(r.customBackground)) && ['day','night'].includes(r.time);
}
export interface PartyGame { game: ArcadeGame; map: number; pack?:string }
export class PeerParty {
  room: MeadowRoom | null = null;
  friends: Presence[] = [];
  game: PartyGame | null = null;
  error = '';
  onChange = () => {};
  onFriends = (_friends: Presence[]) => {};
  onGame = () => {};
  onScores = (_scores: unknown) => {};
  private peer: Peer | null = null;
  private connections = new Map<string,DataConnection>();
  private people = new Map<string,Presence>();
  private own: Presence | null = null;
  private hostPeer = '';
  private host = false;
  private gamePort = 0;
  private scores: unknown = null;
  get isHost() { return this.host && !!this.room; }
  constructor(private peerOptions?: PeerOptions) {
    desktop?.onPacket((p)=>this.connections.get(p.id)?.send({type:'packet',bytes:p.bytes}));
  }
  private async open(id?: string) {
    if (!desktopProfile?.profile) throw new Error('Activate and choose your profile first.');
    this.error='';
    // PeerServer provides rendezvous only. Gameplay travels over WebRTC.
    const peer=id ? new Peer(id,this.peerOptions) : new Peer(this.peerOptions || {});
    this.peer=peer;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{peer.destroy();reject(new Error('The invite service could not connect. Check your internet connection.'));},20000);
      peer.once('open',()=>{clearTimeout(timer);resolve();});
      peer.once('error',()=>{clearTimeout(timer);reject(new Error('Could not open this party. Please try another code.'));});
    });
    peer.on('error',()=>{this.error='The party connection was interrupted. Rejoin with a fresh code.';this.onChange();});
    peer.on('connection',(connection)=>{
      if(!this.host || this.connections.size>=7 || connection.metadata?.protocol!==1) {connection.close();return;}
      this.attach(connection);
    });
  }
  async create(name: string, background: string, customBackground: string, time: 'day'|'night') {
    await this.leave();
    const value=code(); this.host=true;
    try { await this.open('ponyhaven-v1-'+value); }
    catch(e) { await this.leave(); throw e; }
    this.room={code:value,hostUid:desktopProfile!.profile!.id,hostName:name,background,customBackground,time,updatedAt:Date.now(),expiresAt:Date.now()+8*3600000};
    this.onChange();
    return value;
  }
  async join(value: string) {
    const normalized=value.trim().toUpperCase();
    if(!validCode(normalized)) throw new Error('Enter the eight-character invite code.');
    if(this.room?.code===normalized)return;
    await this.leave(); await this.open();
    this.hostPeer='ponyhaven-v1-'+normalized;
    const connection=this.peer!.connect(this.hostPeer,{reliable:true,serialization:'json',metadata:{protocol:1}});
    const ready=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('That party is unavailable. The host needs to keep Ponyhaven open.')),20000);
      const listener=(data: unknown)=>{
        const d=data as {type?:string;room?:MeadowRoom};
        if(d?.type==='room' && d.room && validRoom(d.room) && d.room.code===normalized) {clearTimeout(timer);connection.off('data',listener);resolve();}
      };
      connection.on('data',listener);
      connection.once('error',()=>{clearTimeout(timer);reject(new Error('The party could not connect.'));});
    });
    this.attach(connection);
    try { await ready; } catch(e) {await this.leave();throw e;}
  }
  private attach(connection: DataConnection) {
    this.connections.set(connection.peer,connection);
    connection.on('open',()=>{
      if(this.host) {
        connection.send({type:'room',room:this.room});
        connection.send({type:'roster',people:[...this.people.values(),...(this.own?[this.own]:[])]});
        if(this.game) void this.prepareGuest(connection).catch(()=>{this.error='A game connection could not open. Restart the hosted game.';this.onChange();});
      }
      if(this.own) connection.send({type:'presence',person:this.own});
      if(this.scores) connection.send({type:'scores',scores:this.scores});
    });
    connection.on('data',(raw)=>void this.receive(connection,raw).catch(()=>{this.error='A game packet could not be delivered.';}));
    connection.on('close',()=>{
      this.connections.delete(connection.peer); this.people.delete(connection.peer);
      void desktop?.relayClose(connection.peer);
      if(!this.host) {this.room=null;this.game=null;this.onGame();this.onChange();}
      this.roster();
    });
    connection.on('error',()=>connection.close());
  }
  private async receive(connection: DataConnection, raw: unknown) {
    if(!raw || typeof raw!=='object')return;
    const d=raw as Record<string,unknown>;
    if(d.type==='packet') {
      if(this.game && Array.isArray(d.bytes) && d.bytes.length<=8192) await desktop?.relaySend(connection.peer,d.bytes as number[]);
      return;
    }
    if(d.type==='presence' && presence(d.person)) {
      const p={...d.person,updatedAt:Date.now(),roomCode:this.room?.code || ''};
      if(this.host) {this.people.set(connection.peer,p);this.roster();}
      else {this.people.set(connection.peer,p);this.publishFriends();}
    }
    if(d.type==='room' && !this.host && connection.peer===this.hostPeer && validRoom(d.room as MeadowRoom)) {
      this.room=d.room as MeadowRoom; this.onChange();
      if(this.own) this.updatePresence(this.own);
    }
    if(d.type==='roster' && !this.host && Array.isArray(d.people) && d.people.length<=8 && d.people.every(presence)) {
      this.people=new Map((d.people as Presence[]).map((p)=>[p.uid,{...p,updatedAt:Date.now()}]));this.publishFriends();
    }
    if(d.type==='game' && !this.host && connection.peer===this.hostPeer) {
      const game=d.game as PartyGame;
      if(game && ['adventure','ponykart'].includes(game.game) && Number.isInteger(game.map) && game.map>0 && game.map<=1035 && (!game.pack || /^[a-f0-9]{64}$/.test(game.pack))) this.game=game;
      else this.game=null;
      this.onGame();
    }
    if(d.type==='scores' && JSON.stringify(d.scores).length<=20000) {
      this.onScores(d.scores);
      if(this.host) this.broadcast(d,connection.peer);
    }
  }
  private broadcast(data: unknown, except='') { for(const c of this.connections.values()) if(c.open && c.peer!==except)c.send(data); }
  private roster() {
    this.publishFriends();
    if(this.host)this.broadcast({type:'roster',people:[...this.people.values(),...(this.own?[this.own]:[])]});
  }
  private publishFriends() {
    this.friends=[...this.people.values()].filter((p)=>p.uid!==desktopProfile?.profile?.id).map((p)=>({...p,updatedAt:Date.now(),roomCode:this.room?.code || ''}));
    this.onFriends(this.friends);
  }
  updatePresence(p: Presence) {this.own=p;if(this.host)this.roster();else this.broadcast({type:'presence',person:p});}
  updateScores(scores: unknown) {this.scores=scores;this.broadcast({type:'scores',scores});}
  async background(background: string, customBackground: string, time:'day'|'night') {
    if(!this.isHost)throw new Error('The host chooses the shared background.');
    this.room={...this.room!,background,customBackground,time,updatedAt:Date.now()};
    this.broadcast({type:'room',room:this.room});this.onChange();
  }
  private async prepareGuest(connection: DataConnection) {
    if(!this.game || !this.gamePort)return;
    await desktop!.relayOpen({role:'host',id:connection.peer,port:this.gamePort});
    connection.send({type:'game',game:this.game});
  }
  async hostGame(game: PartyGame, port:number) {
    if(!this.isHost)throw new Error('Host a party first.');
    this.game=game;this.gamePort=port;
    await Promise.all([...this.connections.values()].filter((c)=>c.open).map((c)=>this.prepareGuest(c)));
    this.onGame();
  }
  async guestPort() {
    if(this.host || !this.game || !this.hostPeer)throw new Error('The host has not started a game yet.');
    return desktop!.relayOpen({role:'guest',id:this.hostPeer});
  }
  async endGame() {
    await desktop?.relayClose();
    if(this.host) {this.game=null;this.gamePort=0;this.broadcast({type:'game',game:null});}
    this.onGame();
  }
  async leave() {
    for(const c of this.connections.values())c.close();
    this.connections.clear();this.people.clear();this.peer?.destroy();this.peer=null;
    this.room=null;this.game=null;this.host=false;this.hostPeer='';this.gamePort=0;
    await desktop?.relayClose();this.publishFriends();this.onChange();this.onGame();
  }
}
export const party = new PeerParty();
