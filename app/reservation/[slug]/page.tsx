import { notFound } from 'next/navigation'
import Link from 'next/link'
import { adminClient } from '@/lib/supabase'
import { Booking } from '@/components/booking/booking'
export const dynamic='force-dynamic'
export default async function Reservation({params}:{params:Promise<{slug:string}>}){const {slug}=await params
 const {data}=await adminClient().rpc('public_salon',{p_slug:slug})
 if(!data)notFound()
 return <main className="booking-page"><header className="booking-header"><Link href="/" className="brand"><span className="brand-mark">c<span>.</span></span> ciseo<span className="brand-dot">.</span></Link><span>Réservation en ligne</span></header><Booking salon={{...data,slug}}/><footer className="booking-footer">Propulsé par <strong>Ciseo</strong> · Réservation sécurisée</footer></main>}
