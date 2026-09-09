export class DraftSaveCoordinator<T> {
  private queue: Promise<boolean> = Promise.resolve(true);
  private revision = 0;
  constructor(private readonly persist:(value:T)=>Promise<void>, private readonly onState:(state:"saving"|"saved"|"failed")=>void) {}
  edit(){ return ++this.revision; }
  save(value:T, revision=this.revision){ this.onState("saving"); this.queue=this.queue.catch(()=>false).then(async()=>{try{await this.persist(value);if(revision===this.revision)this.onState("saved");return true;}catch{if(revision===this.revision)this.onState("failed");return false;}});return this.queue; }
  currentRevision(){return this.revision;}
}
