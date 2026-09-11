"use client";
import { useEffect, useMemo, useState } from "react";
import { CAMP_REGISTRATION_FORM as form, requiredFieldsMissing, type FormAnswers, type FormSchema } from "@faith-adventures/domain";
import { DraftSaveCoordinator } from "../lib/draft-save-coordinator";

type DraftSaveRequest = { sessionId:string; camperId:string; answers:FormAnswers };
function labelForSection(index:number){return `${index+1} of ${form.sections.length}`}
export function RegistrationWizard({sessionId,camperId,initialAnswers}:{sessionId:string;camperId:string;initialAnswers:FormAnswers}){
 const [draft,setDraft]=useState<{answers:FormAnswers;section:number}>({answers:initialAnswers,section:0});
 const {answers,section}=draft;
 const [submittedStatus,setSubmittedStatus]=useState<string|null>(null);
 const [finishing,setFinishing]=useState(false);
 const [submitError,setSubmitError]=useState<string|null>(null);
 const [saveState,setSaveState]=useState<"saved"|"saving"|"failed">("saved");
 const [coordinator]=useState(()=>new DraftSaveCoordinator<DraftSaveRequest>(async request=>{const response=await fetch("/api/registrations/draft",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});if(!response.ok)throw new Error();},setSaveState));
 const setAnswers=(next:FormAnswers|((previous:FormAnswers)=>FormAnswers))=>{coordinator.edit();setSaveState("saving");setSubmitError(null);setDraft(previous=>({...previous,answers:typeof next==="function"?next(previous.answers):next}));};
 const setSection=(next:number)=>setDraft(previous=>({...previous,section:next}));
 useEffect(()=>{ if(submittedStatus||finishing) return; const requested=coordinator.currentRevision(); const timer=window.setTimeout(()=>{void coordinator.save({sessionId,camperId,answers},requested);},650); return ()=>window.clearTimeout(timer);},[answers,camperId,sessionId,submittedStatus,finishing,coordinator]);
 const current=form.sections[section]; const missing=useMemo(()=>requiredFieldsMissing(form,answers),[answers]);
 const set=(id:string,value:string|boolean)=>setAnswers(previous=>({...previous,[id]:value}));
 const saveCurrent=async()=>{const revision=coordinator.currentRevision();return coordinator.save({sessionId,camperId,answers},revision);};
 const advance=async()=>{if(finishing)return;setFinishing(true);const saved=await saveCurrent();if(saved)setSection(Math.min(section+1,form.sections.length-1));setFinishing(false);};
 const submit=async()=>{
  if(finishing)return;
  if(missing.length){const idx=form.sections.findIndex(s=>s.fields.some(f=>missing.includes(f.id)));setSection(idx);return;}
  setFinishing(true);setSubmitError(null);
  const finalRevision=coordinator.currentRevision();
  const saved=await coordinator.save({sessionId,camperId,answers},finalRevision);
  if(!saved||finalRevision!==coordinator.currentRevision()){setFinishing(false);return;}
  try{
   const response=await fetch("/api/registrations/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId,camperId,answers})});
   const body=await response.json().catch(()=>({})) as {status?:string;error?:string};
   if(!response.ok)throw new Error(body.error||"Registration could not be submitted.");
   setSubmittedStatus(body.status||"SUBMITTED");
  }catch(error){setSubmitError(error instanceof Error?`${error.message} Your draft is still saved.`:"Registration could not be submitted. Your draft is still saved; please try again.");}
  setFinishing(false);
 };
 if(submittedStatus) return <section className="success"><p className="eyebrow">{submittedStatus==="WAITLISTED"?"Registration waitlisted":"Registration submitted"}</p><h2>Thank you, {String(answers.camperName)}!</h2><p>{submittedStatus==="WAITLISTED"?"This session is full, so the camper has been added to the waitlist. Camp will update the status if space becomes available.":"Your registration is now waiting for camp review. You can track its status from the camper's household page."} Payment is not enabled in this demo yet.</p></section>;
 return <section className="wizard"><p aria-live="polite" className={saveState==="failed"?"error":"eyebrow"}>{saveState==="saving"?"Saving draft…":saveState==="saved"?"Draft saved":"Save failed — edit again to retry."}</p><nav aria-label="Registration progress"><ol>{form.sections.map((item,i)=><li key={item.id} className={i===section?"active":i<section?"done":""}><button disabled={finishing} onClick={()=>setSection(i)}>{i+1}<span>{item.title}</span></button></li>)}</ol></nav><div className="form-card"><div className="step-heading"><p className="eyebrow">{labelForSection(section)}</p><h2>{current.title}</h2>{current.description&&<p className="sensitive">Sensitive information - access is restricted.</p>}</div>{current.fields.map(field=> <Field key={field.id} field={field} value={answers[field.id]} onChange={set} invalid={missing.includes(field.id)} disabled={finishing} />)}<div className="wizard-actions"><button className="button secondary" disabled={section===0||finishing} onClick={()=>setSection(section-1)}>Back</button>{section<form.sections.length-1?<button className="button" disabled={finishing} onClick={()=>void advance()}>{finishing?"Saving draft…":"Save & continue"}</button>:<button className="button" disabled={finishing} onClick={()=>void submit()}>{finishing?"Submitting…":"Submit registration"}</button>}</div>{missing.length>0&&section===form.sections.length-1&&<p className="error">Please complete all required fields before submitting.</p>}{submitError&&<p className="error" role="alert">{submitError}</p>}</div></section>
}
function Field({field,value,onChange,invalid,disabled}:{field:FormSchema["sections"][number]["fields"][number];value:FormAnswers[string];onChange:(id:string,value:string|boolean)=>void;invalid:boolean;disabled:boolean}){
 const id=`field-${field.id}`; const required=field.required?<span aria-hidden="true"> *</span>:null;
 if(field.type==="boolean"||field.type==="checkbox") return <label className={`check-field ${invalid?"invalid":""}`} htmlFor={id}><input id={id} type="checkbox" checked={value===true} disabled={disabled} onChange={e=>onChange(field.id,e.target.checked)} /> <span>{field.label}{required}</span>{field.helpText&&<small>{field.helpText}</small>}</label>;
 return <div className={`field ${invalid?"invalid":""}`}><label htmlFor={id}>{field.label}{required}</label>{field.helpText&&<small>{field.helpText}</small>}{field.type==="textarea"?<textarea id={id} value={String(value??"")} disabled={disabled} onChange={e=>onChange(field.id,e.target.value)} />:field.type==="select"?<select id={id} value={String(value??"")} disabled={disabled} onChange={e=>onChange(field.id,e.target.value)}><option value="">Select one</option>{field.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:<input id={id} type={field.type==="date"?"date":field.type==="number"?"number":"text"} value={String(value??"")} disabled={disabled} onChange={e=>onChange(field.id,e.target.value)} />}</div>;
}
