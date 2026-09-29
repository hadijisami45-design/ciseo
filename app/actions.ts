'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { adminClient, serverClient } from '@/lib/supabase'
import { context, currentUser, platformContext } from '@/lib/access'
import { zonedDateTime } from '@/lib/time'

const str=(form:FormData,key:string)=>String(form.get(key)||'').trim()
const positive=(form:FormData,key:string)=>Math.round(Number(str(form,key).replace(',','.'))*100)
function done(path:string, error?:string):never { redirect(error?`${path}?erreur=${encodeURIComponent(error)}`:path) }
function fail(error:unknown):string { return error instanceof Error ? error.message : 'Une erreur est survenue' }

export async function login(form:FormData) {
  const supabase=await serverClient()
  const {error}=await supabase.auth.signInWithPassword({email:str(form,'email'),password:str(form,'password')})
  if(error) done('/connexion','Identifiants incorrects')
  done('/dashboard')
}
export async function logout() { const c=await serverClient(); await c.auth.signOut(); done('/') }
export async function signup(form:FormData) {
  const email=z.email().parse(str(form,'email'))
  const password=z.string().min(10).parse(str(form,'password'))
  const c=await serverClient()
  const {error}=await c.auth.signUp({email,password,options:{data:{first_name:str(form,'first_name')}}})
  if(error) done('/inscription',error.message)
  done('/connexion?message=Vérifiez votre e-mail puis connectez-vous')
}
export async function createSalon(form:FormData) {
  const user=await currentUser(), db=adminClient()
  const name=z.string().min(2).max(120).parse(str(form,'name'))
  const slug=z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).parse(str(form,'slug'))
  const country=str(form,'country')==='TN'?'TN':'FR'
  const {error}=await db.rpc('create_owner_salon',{p_user:user.id,p_name:name,p_slug:slug,p_city:str(form,'city'),p_country:country})
  if(error) done('/inscription',error.code==='23505'?'Cette adresse est déjà utilisée':error.message)
  done('/dashboard')
}
export async function saveService(form:FormData) {
  const {db,salon}=await context(true), id=str(form,'id')
  const payload={salon_id:salon.id,name:z.string().min(2).max(100).parse(str(form,'name')),
    description:str(form,'description'), duration_minutes:z.number().int().min(5).max(480).parse(Number(str(form,'duration'))),
    price_cents:positive(form,'price'),product_cost_cents:positive(form,'cost'),bookable_online:form.has('online'),active:true}
  if(payload.price_cents<0||payload.product_cost_cents<0) done('/prestations','Montant invalide')
  const {error}=id?await db.from('services').update(payload).eq('id',id).eq('salon_id',salon.id):await db.from('services').insert(payload)
  if(error) done('/prestations',error.message)
  revalidatePath('/prestations'); done('/prestations')
}
export async function deleteService(form:FormData) {
  const {db,salon}=await context(true)
  const {error}=await db.from('services').update({active:false,bookable_online:false}).eq('id',str(form,'id')).eq('salon_id',salon.id)
  if(error) done('/prestations',error.message)
  revalidatePath('/prestations'); done('/prestations')
}
export async function saveStaff(form:FormData) {
  const {db,salon}=await context(true), id=str(form,'id')
  const payload={salon_id:salon.id,display_name:z.string().min(2).parse(str(form,'name')),
    email:str(form,'email')||null,phone:str(form,'phone')||null,active:true,bookable_online:true}
  const result=id?await db.from('staff').update(payload).eq('id',id).eq('salon_id',salon.id).select('id').single()
    :await db.from('staff').insert(payload).select('id').single()
  if(result.error) done('/equipe',result.error.message)
  const staffId=result.data.id
  await db.from('staff_services').delete().eq('staff_id',staffId).eq('salon_id',salon.id)
  const services=form.getAll('service').map(String)
  if(services.length) {
    const {data:valid}=await db.from('services').select('id').eq('salon_id',salon.id).in('id',services)
    if(valid?.length!==services.length) done('/equipe','Prestations invalides')
    const {error}=await db.from('staff_services').insert(services.map(service_id=>({salon_id:salon.id,staff_id:staffId,service_id})))
    if(error) done('/equipe',error.message)
  }
  if(!id) await db.from('staff_working_hours').insert([1,2,3,4,5,6].map(weekday=>({salon_id:salon.id,staff_id:staffId,weekday,start_time:'09:00',end_time:'18:00'})))
  revalidatePath('/equipe'); done('/equipe')
}
export async function deactivateStaff(form:FormData) {
  const {db,salon}=await context(true)
  const {error}=await db.from('staff').update({active:false,bookable_online:false}).eq('salon_id',salon.id).eq('id',str(form,'id'))
  if(error) done('/equipe',error.message)
  revalidatePath('/equipe'); done('/equipe')
}
export async function saveClient(form:FormData) {
  const {db,salon}=await context(), id=str(form,'id')
  const payload={salon_id:salon.id,first_name:z.string().min(2).parse(str(form,'first_name')),
    last_name:str(form,'last_name'),phone:str(form,'phone'),email:str(form,'email')||null,
    notes:str(form,'notes'),allergies:str(form,'allergies'),color_formula:str(form,'color_formula'),
    marketing_email_consent:form.has('email_consent'),marketing_sms_consent:form.has('sms_consent')}
  const {error}=id?await db.from('clients').update(payload).eq('id',id).eq('salon_id',salon.id)
    :await db.from('clients').insert(payload)
  if(error) done('/clients',error.message)
  revalidatePath('/clients'); done('/clients')
}
export async function deleteClient(form:FormData) {
  const {db,salon}=await context(true)
  const {error}=await db.from('clients').update({deleted_at:new Date().toISOString()}).eq('salon_id',salon.id).eq('id',str(form,'id'))
  if(error) done('/clients',error.message)
  revalidatePath('/clients'); done('/clients')
}
export async function createAppointment(form:FormData) {
  const {db,salon}=await context()
  const staff_id=str(form,'staff'), client_id=str(form,'client'), service_id=str(form,'service')
  const {data:service}=await db.from('services').select('*').eq('salon_id',salon.id).eq('id',service_id).eq('active',true).single()
  const {data:staff}=await db.from('staff').select('id').eq('salon_id',salon.id).eq('id',staff_id).eq('active',true).single()
  const {data:client}=await db.from('clients').select('id').eq('salon_id',salon.id).eq('id',client_id).is('deleted_at',null).single()
  if(!service||!staff||!client) done('/agenda','Sélection invalide')
  let start:Date
  try {start=zonedDateTime(str(form,'day'),str(form,'time'),salon.timezone)}
  catch(e) {done('/agenda',fail(e))}
  const {data:appointment,error}=await db.from('appointments').insert({salon_id:salon.id,staff_id,client_id,
    starts_at:start.toISOString(),ends_at:new Date(start.getTime()+service.duration_minutes*60000).toISOString(),
    status:'confirmed',source:'dashboard',total_cents:service.price_cents,product_cost_cents:service.product_cost_cents})
    .select('id').single()
  if(error) done('/agenda',error.code==='23P01'?'Ce créneau est déjà pris':error.message)
  await db.from('appointment_services').insert({salon_id:salon.id,appointment_id:appointment.id,service_id,
    service_name_snapshot:service.name,duration_minutes:service.duration_minutes,
    price_cents:service.price_cents,product_cost_cents:service.product_cost_cents})
  revalidatePath('/agenda'); done('/agenda')
}
export async function updateAppointment(form:FormData) {
  const {db,salon}=await context()
  const status=z.enum(['pending','confirmed','completed','cancelled','no_show']).parse(str(form,'status'))
  const {error}=await db.from('appointments').update({status}).eq('id',str(form,'id')).eq('salon_id',salon.id)
  if(error) done('/agenda',error.message)
  revalidatePath('/agenda'); done('/agenda')
}
export async function recordPayment(form:FormData) {
  const {db,salon}=await context(true)
  const appointment_id=str(form,'appointment')
  const {data:appt}=await db.from('appointments').select('id,total_cents').eq('salon_id',salon.id).eq('id',appointment_id).single()
  if(!appt) done('/finances','Rendez-vous introuvable')
  const method=z.enum(['cash','card','other']).parse(str(form,'method'))
  const amount_cents=positive(form,'amount')
  if(amount_cents<=0) done('/finances','Montant invalide')
  const {error}=await db.from('payments').insert({salon_id:salon.id,appointment_id,amount_cents,method,status:'paid'})
  if(error) done('/finances',error.message)
  revalidatePath('/finances'); done('/finances')
}
export async function addExpense(form:FormData) {
  const {db,salon}=await context(true)
  const amount_cents=positive(form,'amount')
  if(amount_cents<=0) done('/finances','Montant invalide')
  const {error}=await db.from('expenses').insert({salon_id:salon.id,label:z.string().min(2).parse(str(form,'label')),
    category:str(form,'category'),amount_cents,expense_date:str(form,'date')})
  if(error) done('/finances',error.message)
  revalidatePath('/finances'); done('/finances')
}
export async function saveSettings(form:FormData) {
  const {db,salon}=await context(true)
  const {error}=await db.from('salons').update({name:z.string().min(2).parse(str(form,'name')),
    city:str(form,'city'),phone:str(form,'phone'),address:str(form,'address'),booking_enabled:form.has('booking_enabled')})
    .eq('id',salon.id)
  if(error) done('/parametres',error.message)
  revalidatePath('/parametres'); done('/parametres')
}
export async function saveHours(form:FormData) {
  const {db,salon}=await context(true)
  for(let weekday=0;weekday<7;weekday++) {
    const closed=form.has(`closed_${weekday}`), open_time=str(form,`open_${weekday}`), close_time=str(form,`close_${weekday}`)
    if(!closed && (!/^\d\d:\d\d$/.test(open_time)||close_time<=open_time)) done('/parametres','Horaires invalides')
    const {error}=await db.from('business_hours').upsert({salon_id:salon.id,weekday,is_closed:closed,
      open_time:closed?null:open_time,close_time:closed?null:close_time})
    if(error) done('/parametres',error.message)
  }
  done('/parametres')
}
export async function saveStaffHours(form:FormData) {
  const {db,salon}=await context(true), staff_id=str(form,'staff')
  const {data:staff}=await db.from('staff').select('id').eq('salon_id',salon.id).eq('id',staff_id).single()
  if(!staff) done('/equipe','Collaborateur introuvable')
  const rows=[] as {salon_id:string,staff_id:string,weekday:number,start_time:string,end_time:string}[]
  for(let weekday=0;weekday<7;weekday++) if(form.has(`active_${weekday}`)) {
    const start_time=str(form,`start_${weekday}`),end_time=str(form,`end_${weekday}`)
    if(end_time<=start_time) done('/equipe','Horaires invalides')
    rows.push({salon_id:salon.id,staff_id,weekday,start_time,end_time})
  }
  await db.from('staff_working_hours').delete().eq('staff_id',staff_id).eq('salon_id',salon.id)
  if(rows.length){const {error}=await db.from('staff_working_hours').insert(rows);if(error) done('/equipe',error.message)}
  revalidatePath('/equipe');done('/equipe')
}
export async function addTimeOff(form:FormData) {
  const {db,salon}=await context(true), staff_id=str(form,'staff')||null
  if(staff_id){const {data}=await db.from('staff').select('id').eq('id',staff_id).eq('salon_id',salon.id).single();if(!data) done('/equipe','Collaborateur invalide')}
  let start:Date,end:Date
  try {start=zonedDateTime(str(form,'day'),str(form,'start'),salon.timezone);end=zonedDateTime(str(form,'day'),str(form,'end'),salon.timezone)}
  catch(e){done('/equipe',fail(e))}
  if(end<=start) done('/equipe','Fin avant début')
  const {error}=await db.from('time_off').insert({salon_id:salon.id,staff_id,starts_at:start.toISOString(),ends_at:end.toISOString(),reason:str(form,'reason')})
  if(error) done('/equipe',error.message)
  revalidatePath('/equipe');done('/equipe')
}
export async function inviteMember(form:FormData) {
  const {db,salon,role}=await context(true)
  const email=z.email().parse(str(form,'email'))
  const memberRole=str(form,'role')==='manager'&&role==='owner'?'manager':'employee'
  const {data,error}=await db.auth.admin.inviteUserByEmail(email,{redirectTo:`${process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:7000'}/dashboard`})
  if(error||!data.user) done('/equipe',error?.message||'Invitation impossible')
  const {error:memberError}=await db.from('salon_members').insert({salon_id:salon.id,user_id:data.user.id,role:memberRole})
  if(memberError) done('/equipe',memberError.message)
  const {data:staff}=await db.from('staff').select('id').eq('salon_id',salon.id).eq('email',email).is('user_id',null).maybeSingle()
  if(staff) await db.from('staff').update({user_id:data.user.id}).eq('id',staff.id).eq('salon_id',salon.id)
  revalidatePath('/equipe');done('/equipe')
}
export async function updateSubscription(form:FormData) {
  const {db}=await platformContext()
  const status=z.enum(['free','trial','active','past_due','cancelled','suspended']).parse(str(form,'status'))
  const salon_id=z.uuid().parse(str(form,'salon'))
  const {error}=await db.from('subscriptions').update({status}).eq('salon_id',salon_id)
  if(error) done('/admin',error.message)
  revalidatePath('/admin');done('/admin')
}
