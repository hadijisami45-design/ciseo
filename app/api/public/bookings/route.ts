import { NextRequest,NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { adminClient } from '@/lib/supabase'
const schema=z.object({slug:z.string().regex(/^[a-z0-9-]{2,100}$/),staff:z.uuid(),services:z.array(z.uuid()).min(1).max(8),
 start:z.iso.datetime({offset:true}),firstName:z.string().trim().min(2).max(80),lastName:z.string().trim().max(80),
 phone:z.string().trim().min(6).max(24),email:z.union([z.email(),z.literal('')]),website:z.string().max(200).optional(),turnstileToken:z.string().optional()})
export async function POST(request:NextRequest){try{
  const raw=await request.text();if(raw.length>4096)return NextResponse.json({error:'Requête trop volumineuse'},{status:413})
  const p=schema.parse(JSON.parse(raw))
  if(p.website)return NextResponse.json({ok:true}) // honeypot
  if(process.env.TURNSTILE_SECRET_KEY){
    const check=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:process.env.TURNSTILE_SECRET_KEY,response:p.turnstileToken||''})})
    const verdict=await check.json();if(!verdict.success)return NextResponse.json({error:'Vérification anti-spam échouée'},{status:400})
  }
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'
  const fingerprint=createHash('sha256').update(`${ip}:${p.slug}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest('hex')
  const {data,error}=await adminClient().rpc('create_public_booking',{p_slug:p.slug,p_staff:p.staff,p_services:p.services,
    p_start:p.start,p_first_name:p.firstName,p_last_name:p.lastName,p_phone:p.phone,p_email:p.email,p_fingerprint:fingerprint})
  if(error)return NextResponse.json({error:error.code==='23P01'?'Ce créneau vient d’être réservé. Choisissez-en un autre.':error.message},{status:409})
  return NextResponse.json({ok:true,bookingId:data},{status:201})
}catch{return NextResponse.json({error:'Vérifiez les informations saisies.'},{status:400})}}
