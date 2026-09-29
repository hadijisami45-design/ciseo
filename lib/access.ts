import { redirect } from 'next/navigation'
import { adminClient, serverClient } from './supabase'

export async function currentUser() {
  const client = await serverClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) redirect('/connexion')
  return user
}
export async function context(requireManager = false) {
  const user = await currentUser()
  const db = adminClient()
  const { data: memberships, error } = await db.from('salon_members').select('salon_id,role,salons(*)')
    .eq('user_id', user.id).order('created_at').limit(1)
  if (error) throw new Error(error.message)
  const member = memberships?.[0]
  if (!member) redirect('/inscription')
  if (requireManager && member.role === 'employee') redirect('/dashboard')
  const salon = member.salons as unknown as Record<string, any>
  return { user, db, salon, role: member.role as 'owner'|'manager'|'employee' }
}
export async function platformContext() {
  const user = await currentUser()
  const db = adminClient()
  const { data } = await db.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle()
  if (!data) redirect('/dashboard')
  return { user, db }
}
export function money(value: number, currency='EUR') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value/100)
}
export function localDate(value: string, tz='Europe/Paris') {
  return new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:tz}).format(new Date(value))
}
