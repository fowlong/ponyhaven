import { collection, doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, setDoc, deleteDoc, type DocumentData } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { freshSave, readSave } from './game';
import { desktop, refreshDesktop } from './desktop';
import { auth, db, cloudConfigured, accountLogin, invitation } from './cloud';
import { party } from './peer-party';
import type { Presence, Save } from './types';

interface Envelope { save:Save; revision:number; pending:boolean; cloudUid?:string }
/** A local backup plus a revision-checked cloud snapshot. Concurrent changes
 * never merge wallets or overwrite one another; the losing branch is backed up. */
export class SaveStore {
  uid='guest'; name='Friend'; revision=0; cloudUid=''; conflicted=false;
  status='Saved on this device'; onStatus=(_status:string)=>{}; onRemote=(_save:Save)=>{};
  private pending:Save|null=null;
  private localPending:Save|null=null;
  private diskFlush:Promise<void>|null=null;
  private cloudFlush:Promise<void>|null=null;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private stopWatch=()=>{};
  private deferred:DocumentData|null=null;
  private latest:Save|null=null;
  get key(){return `ponyhaven:save:${this.uid}`;}
  get linked(){return !!this.cloudUid;}
  private get canSync(){return !!db && auth?.currentUser?.uid===this.cloudUid;}
  async load():Promise<Save|null> {
    this.stopWatch();
    let disk:Save|null=null;
    if (desktop) {
      const status=await refreshDesktop();
      if (!status?.activated || !status.profile) return null;
      this.uid=status.profile.id; this.name=status.profile.name; this.cloudUid=status.profile.cloudUid||'';
      const data=await desktop.load();
      disk=data===null?freshSave(this.name):readSave(data);
      if (!disk) throw new Error('This profile needs recovery. Its save files have been preserved.');
      if (!this.linked) disk.name=this.name;
    } else if (import.meta.env.VITE_REQUIRE_AUTH==='true' && !cloudConfigured) {
      throw new Error('The owner needs to finish connecting this meadow’s account service.');
    }
    if (auth) await auth.authStateReady();
    if (!desktop && auth) {
      if (!auth.currentUser) return null;
      this.uid=auth.currentUser.uid;this.cloudUid=this.uid;
    }
    const local=this.readLocal();
    this.revision=local?.cloudUid===this.cloudUid ? local.revision : 0;
    this.latest=disk || local?.save || freshSave(this.name);
    if (this.linked && local?.pending && local.cloudUid===this.cloudUid) this.pending=local.save;
    if (!this.linked) {this.setStatus(desktop?'Saved to your local profile':'Saved on this device');return this.latest;}
    if (!this.canSync) {this.setStatus('Sync paused · reconnect this profile in settings');return this.latest;}
    try {
      this.name=await invitation(this.cloudUid);
      const remote=await getDocFromServer(doc(db!,'players',this.cloudUid));
      const revision=remote.exists()?remote.data().revision:0;
      if (this.pending && this.revision!==revision) {
        this.conflict();
      } else if (this.pending) {
        this.latest=this.pending;
        this.schedule(0);
      } else if (remote.exists()) {
        await this.accept(remote.data(),false);
      } else {
        if (!desktop) this.latest=freshSave(this.name);
        this.revision=0;
        this.setStatus('Cloud save connected');
      }
      this.watch();
    } catch (error) {
      const code=(error as {code?:string}).code || '';
      if (!local || code.includes('permission-denied') || (error instanceof Error && error.message.includes('invited'))) throw error;
      this.setStatus('Saved on device · waiting for connection');
      this.watch();
    }
    return this.latest;
  }
  private readLocal():Envelope|null {
    const raw=localStorage.getItem(this.key);if(!raw)return null;
    try {const d=JSON.parse(raw),save=readSave(d.save);if(save && Number.isSafeInteger(d.revision) && d.revision>=0)return {...d,save};}catch{}
    localStorage.setItem(`${this.key}:recovery:${Date.now()}`,raw);return null;
  }
  private cache(save:Save,pending:boolean){localStorage.setItem(this.key,JSON.stringify({save,revision:this.revision,pending,cloudUid:this.cloudUid}));}
  private setStatus(s:string){this.status=s;this.onStatus(s);}
  private schedule(ms=1500){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush().catch(()=>{}),ms);}
  private conflict(){
    const branch=this.pending || this.latest;
    if(branch)localStorage.setItem(this.key+':conflict-backup',JSON.stringify({save:branch,revision:this.revision,pending:true,cloudUid:this.cloudUid}));
    this.conflicted=true;
    this.setStatus('Progress changed on another device · choose the synced save to continue');
  }
  write(save:Save){
    if(this.conflicted)throw new Error('Progress changed on another device. Use “Load synced progress” in settings; your device copy is backed up.');
    this.latest=structuredClone(save);
    this.cache(this.latest,this.linked);
    if(desktop){this.localPending=this.latest;void this.flushDisk().catch(()=>{});}
    if(this.linked){this.pending=this.latest;this.setStatus(this.canSync?'Saving…':'Saved locally · sync account needs reconnecting');this.schedule();}
    else this.setStatus(desktop?'Saving locally…':'Saved on this device');
  }
  private async flushDisk(){
    if(!desktop)return;
    if(this.diskFlush)return this.diskFlush;
    this.diskFlush=(async()=>{
      while(this.localPending){const snapshot=this.localPending;this.localPending=null;
        try{await desktop.save(snapshot);}catch{this.localPending=this.localPending||snapshot;this.setStatus('Save needs attention · export a backup');throw new Error('Your latest progress could not be saved. Export a backup before changing profiles.');}
      }
      if(!this.linked)this.setStatus('Saved to your local profile');
    })();
    try{await this.diskFlush;}finally{this.diskFlush=null;}
  }
  async flush(){
    await this.flushDisk();
    if(this.cloudFlush)return this.cloudFlush;
    if(!this.canSync || !this.pending || this.conflicted)return;
    this.cloudFlush=this.upload();
    try{await this.cloudFlush;}finally{
      this.cloudFlush=null;
      const remote=this.deferred;this.deferred=null;
      if(remote)await this.receive(remote);
      if(this.pending && !this.conflicted)this.schedule(10000);
    }
  }
  private async upload(){
    // Drain all queued snapshots, including changes made while a request is in flight.
    while(this.pending && !this.conflicted){
      const snapshot=this.pending,revision=this.revision;this.pending=null;
      try {
        await runTransaction(db!,async transaction=>{
          const ref=doc(db!,'players',this.cloudUid),remote=await transaction.get(ref);
          if((remote.exists()?remote.data().revision:0)!==revision)throw new Error('SAVE_CONFLICT');
          transaction.set(ref,{save:snapshot,revision:revision+1,updatedAt:serverTimestamp()});
        });
        this.revision=revision+1;
        this.cache(this.pending||snapshot,!!this.pending);
        this.setStatus(this.pending?'Saving…':'Cloud saved');
      } catch(error){
        this.pending=this.pending||snapshot;
        if(error instanceof Error && error.message==='SAVE_CONFLICT')this.conflict();
        else this.setStatus('Saved on device · cloud retry pending');
        break;
      }
    }
  }
  private watch(){
    this.stopWatch();
    this.stopWatch=onSnapshot(doc(db!,'players',this.cloudUid),snapshot=>{
      if(!snapshot.exists() || snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache)return;
      const data=snapshot.data();
      if(this.cloudFlush){this.deferred=data;return;}
      void this.receive(data).catch(()=>this.setStatus('Cloud save needs recovery · device copy preserved'));
    },()=>this.setStatus('Sync is reconnecting · your device copy is safe'));
  }
  private async receive(data:DocumentData){
    if(!Number.isSafeInteger(data.revision) || data.revision<=this.revision || this.conflicted)return;
    if(this.pending){this.conflict();return;}
    await this.accept(data,true);
  }
  private async accept(data:DocumentData,notify:boolean){
    const save=readSave(data.save);
    if(!save || !Number.isSafeInteger(data.revision))throw new Error('Your cloud save needs recovery. It has not been overwritten.');
    this.revision=data.revision;this.latest=save;this.cache(save,false);
    if(notify)this.onRemote(save);
    if(desktop){this.localPending=save;await this.flushDisk();}
    this.setStatus('Cloud saved');
  }
  async reloadCloud(){
    if(!this.canSync)throw new Error('Reconnect your sync account first.');
    await this.flushDisk();
    if(this.cloudFlush)await this.cloudFlush;
    const remote=await getDocFromServer(doc(db!,'players',this.cloudUid));
    if(!remote.exists())throw new Error('There is no synced save to load yet.');
    if(desktop)await desktop.backup();
    if(this.latest)localStorage.setItem(this.key+':before-cloud-load',JSON.stringify(this.latest));
    // Validate before clearing the pending branch.
    if(!readSave(remote.data().save))throw new Error('The synced save needs recovery.');
    this.pending=null;this.conflicted=false;
    await this.accept(remote.data(),true);
  }
  async connectDesktop(account:string,password:string,current:Save){
    if(!desktop || !auth || !db)throw new Error('Your host needs to configure Firebase before connecting sync.');
    await this.flushDisk();
    await accountLogin(account,password);
    const uid=auth.currentUser!.uid;
    await invitation(uid);
    if(this.cloudUid && this.cloudUid!==uid)throw new Error('This profile is linked to a different account. Disconnect it before changing accounts.');
    const remote=await getDocFromServer(doc(db,'players',uid));
    const wasLinked=this.cloudUid===uid;
    if(remote.exists() && !readSave(remote.data().save))throw new Error('Your synced save needs recovery.');
    await desktop.backup();
    await desktop.linkCloud(uid);this.cloudUid=uid;
    if(!wasLinked && remote.exists()) {
      this.pending=null;await this.accept(remote.data(),true);
    } else if(!wasLinked) {
      this.revision=0;this.write(current);await this.flush();
    } else if(this.pending) {
      if((remote.exists()?remote.data().revision:0)!==this.revision)this.conflict();else await this.flush();
    } else if(remote.exists())await this.accept(remote.data(),true);
    this.watch();
  }
  async disconnectDesktop(){
    await this.flush();
    if(this.pending || this.conflicted)throw new Error('Sync or load your cloud progress before disconnecting. Export the device backup if you need it.');
    this.stopWatch();await desktop?.linkCloud(null);this.cloudUid='';this.revision=0;
    if(auth)await signOut(auth);
    if(this.latest)this.cache(this.latest,false);
    this.setStatus('Saved to your local profile');
  }
  watchFriends(callback:(friends:Presence[])=>void,onError:(message:string)=>void){
    if(desktop){party.onFriends=callback;return()=>{party.onFriends=()=>{};};}
    if(!db || !this.cloudUid)return()=>{};
    return onSnapshot(collection(db,'meadow'),snap=>callback(snap.docs.filter(d=>d.id!==this.cloudUid).map(d=>({uid:d.id,...d.data(),updatedAt:d.data().updatedAt?.toMillis?.()||0}) as Presence)),()=>onError('Shared meadow is reconnecting…'));
  }
  async presence(save:Save,x:number,roomCode='',hostedRoom=''){
    if(desktop && save.pet){party.updatePresence({uid:this.uid,name:save.name,...save.pet,x,roomCode,hostedRoom,updatedAt:Date.now()});return;}
    if(!db || !this.cloudUid || !save.pet)return;
    await setDoc(doc(db,'meadow',this.cloudUid),{name:save.name,ponyId:save.pet.ponyId,rarity:save.pet.rarity,tier:save.pet.tier,x,roomCode,hostedRoom,updatedAt:serverTimestamp()});
  }
  async leave(){if(!desktop && db && this.cloudUid)await deleteDoc(doc(db,'meadow',this.cloudUid)).catch(()=>{});}
  async logout(){
    await this.flush();
    if(this.pending || this.cloudFlush)throw new Error('Your cloud save is pending. Reconnect before signing out, or export a backup.');
    this.stopWatch();await this.leave();if(auth)await signOut(auth);
  }
}
