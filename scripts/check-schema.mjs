import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// Embedded PostgreSQL validates the migration and tenant isolation. The btree_gist
// extension is not bundled with PGlite, so its exclusion constraint is tested in Supabase.
const db=new PGlite()
try {
 await db.exec(`create schema auth;
 create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create role authenticated;create role anon;create role service_role;`)
 let sql=readFileSync(new URL('../supabase/migrations/0001_initial_schema.sql',import.meta.url),'utf8')
 sql=sql.replace(/create extension if not exists pgcrypto;\n/g,'').replace(/create extension if not exists btree_gist;\n/g,'')
  .replace(/alter table public.appointments add constraint appointments_no_overlap[\s\S]*?where\(status in \('pending','confirmed'\)\);/,'')
 await db.exec(sql)
 const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']
 const salons=[]
 for(let i=0;i<2;i++){
  await db.query('insert into auth.users(id) values($1)',[users[i]])
  salons.push((await db.query('select public.create_owner_salon($1,$2,$3,$4,$5) as id',[users[i],`Salon ${i}`,`salon-${i}`,'Paris','FR'])).rows[0].id)
  await db.query('insert into public.clients(salon_id,first_name) values($1,$2)',[salons[i],`Client ${i}`])
  await db.query('insert into public.payments(salon_id,amount_cents,method) values($1,1000,$2)',[salons[i],'cash'])
 }
 const staff=(await db.query('insert into public.staff(salon_id,display_name) values($1,$2) returning id',[salons[0],'Sarah'])).rows[0].id
 const service=(await db.query('insert into public.services(salon_id,name,duration_minutes,price_cents) values($1,$2,30,2500) returning id',[salons[0],'Coupe'])).rows[0].id
 await db.query('insert into public.staff_services(salon_id,staff_id,service_id) values($1,$2,$3)',[salons[0],staff,service])
 await db.query('insert into public.staff_working_hours(salon_id,staff_id,weekday,start_time,end_time) values($1,$2,4,$3,$4)',[salons[0],staff,'09:00','18:00'])
 const nextThursday=new Date()
 nextThursday.setUTCDate(nextThursday.getUTCDate()+((4-nextThursday.getUTCDay()+7)%7||7))
 nextThursday.setUTCHours(10,0,0,0)
 const appointment=(await db.query('select public.create_public_booking($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',
  ['salon-0',staff,[service],nextThursday.toISOString(),'Lina','','0600000000','','a'.repeat(64)])).rows[0].id
 const saved=(await db.query('select a.total_cents,s.price_cents from public.appointments a join public.appointment_services s on s.appointment_id=a.id where a.id=$1',[appointment])).rows[0]
 assert.equal(saved.total_cents,2500);assert.equal(saved.price_cents,2500)
 // On Supabase, these grants are provided by its default schema privileges.
 await db.exec('grant usage on schema public to authenticated; grant select on public.clients,public.payments to authenticated')
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[0]])
 await db.exec('set role authenticated')
 const clients=(await db.query('select first_name from public.clients order by first_name')).rows
 const payments=(await db.query('select salon_id from public.payments')).rows
 assert.equal(clients.length,2) // One manual client and one created by public booking.
 assert.ok(clients.every(c=>c.first_name!=='Client 1'))
 assert.equal(payments.length,1);assert.equal(payments[0].salon_id,salons[0])
 console.log('Schéma, réservation transactionnelle et isolation RLS : OK')
}finally{await db.close()}
