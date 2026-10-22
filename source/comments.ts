import {env} from 'cloudflare:workers';
import parking from '../public/parking.json';
const facilities=new Map(parking.places.map(p=>[p.id,p.name]));
export type Row={id:string;facility_id:string;vehicle:string;body:string;photos:string;status:string;created_at:string;reviewed_at:string|null;reviewer:string|null;admin_note:string;submission_hash:string};
export const database=()=>{if(!env.DB)throw new Error('Storage unavailable');return env.DB;};
export const bucket=()=>{if(!env.BUCKET)throw new Error('Storage unavailable');return env.BUCKET;};
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function isAdmin(request:Request){const email=request.headers.get('oai-authenticated-user-email');return !!env.ADMIN_EMAIL&&!!request.headers.get('oai-authenticated-user-id')&&email?.toLowerCase()===env.ADMIN_EMAIL.toLowerCase();}
export function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin;}
export const generalCommentsId='__general__';
export function validCommentTarget(id:string){return id===generalCommentsId||validFacility(id);}
export function validFacility(id:string){return facilities.has(id);}
export function storedComment(text:string,region:string){return JSON.stringify({tomespotComment:1,text,region});}
export function commentContent(r:Row){try{const value=JSON.parse(r.body);if(value?.tomespotComment===1&&typeof value.text==='string'&&typeof value.region==='string')return {body:value.text,region:value.region};}catch{}return {body:r.body,region:''};}
export function publicRow(r:Row){return {id:r.id,facilityId:r.facility_id,facilityName:facilities.get(r.facility_id)||r.facility_id,kind:r.facility_id===generalCommentsId?'general':'facility',vehicle:r.vehicle==='motorcycleV2'?'motorcycle':r.vehicle,legacyMotorcycle:r.vehicle==='motorcycle',...commentContent(r),photos:(JSON.parse(r.photos) as string[]).map((_,i)=>`/api/photos/${r.id}?index=${i}`),createdAt:r.created_at};}
export async function digest(text:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function boundedBody(request:Request,max=7*1024*1024){if(Number(request.headers.get('content-length')||0)>max)throw new Error('too_large');const reader=request.body?.getReader();if(!reader)throw new Error('invalid');const chunks:ArrayBuffer[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('too_large');}chunks.push(new Uint8Array(value).buffer);}return new Blob(chunks);}
export function imageType(bytes:Uint8Array){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return 'image/png';if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';return null;}
