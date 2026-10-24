import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { desktop, desktopProfile, type EquestriaIdentity, type EquestriaTicket } from './desktop';
import type { MeadowRoom, Presence } from './types';
import { equestriaMismatch, readPartyGame, type EquestriaBuild, type PartyGame } from './party-game';
import { validEquestria, EQUESTRIA_BOSSES, type EquestriaProgress } from './equestria-state';
import type { EquestriaRewardEvent } from './equestria-rewards';
export type { PartyGame } from './party-game';

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
export class PeerParty {
  room: MeadowRoom | null = null;
  friends: Presence[] = [];
  game: PartyGame | null = null;
  error = '';
  onChange = () => {};
  onFriends = (_friends: Presence[]) => {};
  onGame = () => {};
  onScores = (_scores: unknown) => {};
  onEquestriaReward = async (_event:EquestriaRewardEvent):Promise<EquestriaProgress> => {throw new Error('Open Equestria before receiving treasure.');};
  equestriaTicket:EquestriaTicket|null=null;
  private peer: Peer | null = null;
  private connections = new Map<string,DataConnection>();
  private people = new Map<string,Presence>();
  private own: Presence | null = null;
  private hostPeer = '';
  private host = false;
  private gamePort = 0;
  private scores: unknown = null;
  private accepted = new Set<string>();
  private tickets = new Map<string,EquestriaTicket>();
  private preparing = new Map<string, Promise<void>>();
  private pendingJoin: { session: string; resolve: () => void; reject: (error: Error) => void } | null = null;
  get isHost() { return this.host && !!this.room; }
  constructor(private peerOptions?: PeerOptions) {
    desktop?.onPacket((p)=>{
      const c=this.connections.get(p.id);
      if(!c?.open || !this.game || (this.game.game==='equestria' && !this.accepted.has(p.id)))return;
      // JSON arrays can exceed PeerJS's 16 KB message limit for an 8 KB datagram.
      c.send(this.game.game==='equestria'
        ? {type:'packet',payload:btoa(String.fromCharCode(...p.bytes)),session:this.game.session}
        : {type:'packet',bytes:p.bytes});
    });
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
    let controls=Promise.resolve();
    const failed=()=>{this.error='A game packet could not be delivered.';this.onChange();};
    connection.on('data',(raw)=>{
      if((raw as {type?:unknown})?.type==='packet')void this.receive(connection,raw).catch(failed);
      else controls=controls.then(()=>this.receive(connection,raw)).catch(failed);
    });
    connection.on('close',()=>{
      this.connections.delete(connection.peer); this.people.delete(connection.peer);
      this.accepted.delete(connection.peer);
      if(this.tickets.delete(connection.peer))void desktop?.equestriaRevoke(connection.peer).catch(()=>{});
      void desktop?.relayClose(connection.peer);
      if(!this.host) {this.cancelJoin('The host left the party.');this.equestriaTicket=null;this.room=null;this.game=null;this.onGame();this.onChange();}
      this.roster();
    });
    connection.on('error',()=>connection.close());
  }
  private async receive(connection: DataConnection, raw: unknown) {
    if(!raw || typeof raw!=='object')return;
    const d=raw as Record<string,unknown>;
    if(d.type==='packet') {
      if(this.game?.game==='equestria' && (!this.accepted.has(connection.peer) || d.session!==this.game.session))return;
      if(this.game?.game==='equestria' && typeof d.payload==='string' && d.payload.length<=10924 && /^[A-Za-z0-9+/]*={0,2}$/.test(d.payload)) {
        const bytes=Array.from(atob(d.payload),c=>c.charCodeAt(0));
        if(bytes.length<=8192)await desktop?.relaySend(connection.peer,bytes);
        return;
      }
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
      const game=readPartyGame(d.game);
      if(this.game?.game==='equestria' || game?.game==='equestria' || !game) {
        this.cancelJoin('The host changed or ended the game.');this.accepted.clear();this.equestriaTicket=null;
        await desktop?.relayClose();
      }
      this.game=game;
      if(d.game && !game)this.error='This hosted game needs a compatible Ponyhaven update.';
      this.onGame();
    }
    if(d.type==='equestria-ready' && this.game?.game==='equestria' && d.session===this.game.session) {
      if(this.host) {
        const mismatch=equestriaMismatch(this.game,d.build);
        if(mismatch) {connection.send({type:'equestria-rejected',session:this.game.session});return;}
        const previous=this.preparing.get(connection.peer);
        if(previous) {await previous;return;}
        const game=this.game;
        const prepare=(async()=>{
          let ticket=this.tickets.get(connection.peer);
          if(!ticket)ticket=await desktop!.equestriaInvite(connection.peer,d.identity as EquestriaIdentity);
          if(this.game!==game || !connection.open){await desktop!.equestriaRevoke(connection.peer);return;}
          this.tickets.set(connection.peer,ticket);
          if(!this.accepted.has(connection.peer))await desktop!.relayOpen({role:'host',id:connection.peer,port:this.gamePort});
          if(this.game!==game || !connection.open)return;
          this.accepted.add(connection.peer);
          connection.send({type:'equestria-ready',session:game.session,ticket});
        })();
        this.preparing.set(connection.peer,prepare);
        try {await prepare;} catch {connection.send({type:'equestria-rejected',session:game.session});}
        finally {if(this.preparing.get(connection.peer)===prepare)this.preparing.delete(connection.peer);}
      } else if(connection.peer===this.hostPeer && this.pendingJoin?.session===d.session) {
        const ticket=d.ticket as EquestriaTicket;
        if(!ticket || typeof ticket.name!=='string' || !/^ph_[a-f0-9]{16}$/.test(ticket.name) || typeof ticket.password!=='string' || !/^[a-f0-9]{48}$/.test(ticket.password))return;
        this.equestriaTicket={name:ticket.name,password:ticket.password};
        this.pendingJoin.resolve();
      }
    }
    if(d.type==='equestria-rejected' && !this.host && connection.peer===this.hostPeer && this.pendingJoin?.session===d.session)
      this.cancelJoin('The host could not accept this Equestria connection. Check that both players have the same map and game update.');
    if(this.game?.game==='equestria' && d.session===this.game.session && this.accepted.has(connection.peer)) {
      if(d.type==='equestria-input' && this.host && Number.isInteger(d.book) && Number(d.book)>=1 && Number(d.book)<=7)
        await desktop!.equestriaInput(connection.peer,Number(d.book),this.game.session);
      if(d.type==='equestria-leave' && this.host) {
        this.accepted.delete(connection.peer);this.tickets.delete(connection.peer);
        try {await desktop!.equestriaRevoke(connection.peer);}
        finally {await desktop!.relayClose(connection.peer);}
        return;
      }
      if(d.type==='equestria-reward' && !this.host && connection.peer===this.hostPeer && validReward(d.event)) {
        const game=this.game,state=await this.onEquestriaReward(d.event);
        if(this.game===game)connection.send({type:'equestria-ack',session:game.session,state});
      }
      if(d.type==='equestria-ack' && this.host && validEquestria(d.state)) {
        const ticket=this.tickets.get(connection.peer);if(ticket)await desktop!.equestriaAck(ticket.name,d.state);
      }
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
    // Equestria peers must agree on the exact world and gameplay before any UDP is forwarded.
    if(this.game.game!=='equestria')await desktop!.relayOpen({role:'host',id:connection.peer,port:this.gamePort});
    connection.send({type:'game',game:this.game});
  }
  async hostGame(game: PartyGame, port:number) {
    if(!this.isHost)throw new Error('Host a party first.');
    const validated=readPartyGame(game);
    if(!validated || (validated.game==='equestria' && equestriaMismatch(validated,validated)))throw new Error('Unsupported game session.');
    if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('Invalid game port.');
    await this.endGame();
    this.game=validated;this.gamePort=port;
    await Promise.all([...this.connections.values()].filter((c)=>c.open).map((c)=>this.prepareGuest(c)));
    this.onGame();
  }
  async guestPort(build?:EquestriaBuild,identity?:EquestriaIdentity) {
    if(this.host || !this.game || !this.hostPeer)throw new Error('The host has not started a game yet.');
    const game=this.game;
    if(game.game==='equestria') {
      const mismatch=equestriaMismatch(game,build);
      if(mismatch)throw new Error(mismatch);
      if(!identity || !validEquestria(identity.state))throw new Error('Choose a pony and load your profile before joining Equestria.');
      if(this.pendingJoin)throw new Error('An Equestria connection is already opening.');
      const connection=this.connections.get(this.hostPeer);
      if(!connection?.open)throw new Error('The host is no longer connected.');
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>this.cancelJoin('The host did not accept the Equestria connection in time. Try joining again.'),10000);
        const clear=()=>{clearTimeout(timer);this.pendingJoin=null;};
        this.pendingJoin={session:game.session,resolve:()=>{clear();resolve();},reject:e=>{clear();reject(e);}};
        connection.send({type:'equestria-ready',session:game.session,build,identity});
      });
      if(this.game!==game)throw new Error('The host changed or ended the game.');
    }
    const port=await desktop!.relayOpen({role:'guest',id:this.hostPeer});
    if(this.game!==game) {await desktop?.relayClose(this.hostPeer);throw new Error('The host changed or ended the game.');}
    if(game.game==='equestria')this.accepted.add(this.hostPeer);
    return port;
  }
  private cancelJoin(message:string) {this.pendingJoin?.reject(new Error(message));}
  equestriaInput(book:number){
    if(this.host||this.game?.game!=='equestria'||!Number.isInteger(book)||book<1||book>7||!this.accepted.has(this.hostPeer))return;
    this.connections.get(this.hostPeer)?.send({type:'equestria-input',session:this.game.session,book});
  }
  deliverEquestriaReward(player:string,event:EquestriaRewardEvent) {
    if(!this.isHost || this.game?.game!=='equestria' || !validReward(event))return;
    for(const [peer,ticket] of this.tickets)if(ticket.name===player && this.accepted.has(peer))
      this.connections.get(peer)?.send({type:'equestria-reward',session:this.game.session,event});
  }
  async endGame() {
    this.cancelJoin('The game connection was closed.');
    if(!this.host && this.game?.game==='equestria' && this.accepted.has(this.hostPeer))
      this.connections.get(this.hostPeer)?.send({type:'equestria-leave',session:this.game.session});
    this.accepted.clear();
    if(this.host) {this.game=null;this.gamePort=0;this.broadcast({type:'game',game:null});}
    await Promise.allSettled(this.preparing.values());
    this.preparing.clear();
    await Promise.allSettled([...this.tickets.keys()].map(peer=>desktop!.equestriaRevoke(peer)));
    this.tickets.clear();this.equestriaTicket=null;
    await desktop?.relayClose();
    this.onGame();
  }
  async leave() {
    this.cancelJoin('You left the party.');this.accepted.clear();
    for(const c of this.connections.values())c.close();
    this.connections.clear();this.people.clear();this.peer?.destroy();this.peer=null;
    this.room=null;this.game=null;this.host=false;this.hostPeer='';this.gamePort=0;
    await Promise.allSettled(this.preparing.values());this.preparing.clear();
    await Promise.allSettled([...this.tickets.keys()].map(peer=>desktop!.equestriaRevoke(peer)));
    this.tickets.clear();this.equestriaTicket=null;
    await desktop?.relayClose();this.publishFriends();this.onChange();this.onGame();
  }
}
function validReward(value:unknown):value is EquestriaRewardEvent {
  if(!value || typeof value!=='object')return false;
  const e=value as EquestriaRewardEvent,count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=1e12;
  if(e.kind==='progress')return count(e.rings)&&count(e.quests);
  if(e.kind==='book')return Number.isInteger(e.book)&&e.book>=1&&e.book<=7;
  if(e.kind==='boss')return EQUESTRIA_BOSSES.has(e.boss);
  return e.kind==='chest' && count(e.chest)&&e.chest<50&&count(e.sequence)&&e.sequence>0&&Number.isSafeInteger(e.at)&&e.at>0&&e.at<=8.64e15;
}
export const party = new PeerParty();
