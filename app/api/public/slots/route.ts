import { NextRequest,NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase'
import { zonedDateTime } from '@/lib/time'
import { z } from 'zod'
export const dynamic='force-dynamic'
const query=z.object({slug:z.string().max(100),staff:z.uuid(),services:z.string().max(500),day:z.iso.date()})
export async function GET(request:NextRequest){try{
  const q=query.parse(Object.fromEntries(request.nextUrl.searchParams))
  const ids=q.services.split(',').filter(Boolean).slice(0,8)
  if(!ids.length||ids.some(v=>!z.uuid().safeParse(v).success)) return NextResponse.json({error:'Prestations invalides'},{status:400})
  const db=adminClient()
  const {data:salon}=await db.from('salons').select('id,timezone,booking_notice_minutes').eq('slug',q.slug).eq('booking_enabled',true).single()
  if(!salon) return NextResponse.json({slots:[]})
  const [services,staff,hours,shifts,appointments,off]=await Promise.all([
    db.from('services').select('id,duration_minutes').eq('salon_id',salon.id).eq('active',true).eq('bookable_online',true).in('id',ids),
    db.from('staff').select('id').eq('salon_id',salon.id).eq('id',q.staff).eq('active',true).eq('bookable_online',true).single(),
    db.from('business_hours').select('*').eq('salon_id',salon.id).eq('weekday',new Date(`${q.day}T12:00:00Z`).getUTCDay()).maybeSingle(),
    db.from('staff_working_hours').select('*').eq('staff_id',q.staff),
    db.from('appointments').select('starts_at,ends_at').eq('staff_id',q.staff).in('status',['pending','confirmed']).gte('starts_at',new Date(Date.parse(q.day)-86400000).toISOString()).lt('starts_at',new Date(Date.parse(q.day)+2*86400000).toISOString()),
    db.from('time_off').select('staff_id,starts_at,ends_at').eq('salon_id',salon.id).lt('starts_at',new Date(Date.parse(q.day)+2*86400000).toISOString()).gt('ends_at',new Date(Date.parse(q.day)-86400000).toISOString())
  ])
  const {data:allowed}=await db.from('staff_services').select('service_id').eq('staff_id',q.staff).in('service_id',ids)
  if(!staff.data||services.data?.length!==ids.length||allowed?.length!==ids.length||hours.data?.is_closed||!hours.data) return NextResponse.json({slots:[]})
  const duration=services.data.reduce((v,s)=>v+s.duration_minutes,0)
  const weekday=new Date(`${q.day}T12:00:00Z`).getUTCDay()
  const slots:{time:string,start:string}[]=[]
  const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5))
  for(let t=minute(hours.data.open_time);t+duration<=minute(hours.data.close_time);t+=30){
    const time=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
    const shift=shifts.data?.some(s=>s.weekday===weekday && t>=minute(s.start_time) && t+duration<=minute(s.end_time))
    if(!shift) continue
    let start:Date;try{start=zonedDateTime(q.day,time,salon.timezone)}catch{continue}
    const end=start.getTime()+duration*60000
    if(start.getTime()<Date.now()+salon.booking_notice_minutes*60000||start.getTime()>Date.now()+90*86400000)continue
    if(appointments.data?.some(a=>Date.parse(a.starts_at)<end&&Date.parse(a.ends_at)>start.getTime()))continue
    if(off.data?.some(o=>Date.parse(o.starts_at)<end&&Date.parse(o.ends_at)>start.getTime()&&(o.staff_id===null||o.staff_id===q.staff)))continue
    slots.push({time,start:start.toISOString()})
  }
  return NextResponse.json({slots},{headers:{'Cache-Control':'no-store'}})
}catch{return NextResponse.json({error:'Requête invalide'},{status:400})}}
