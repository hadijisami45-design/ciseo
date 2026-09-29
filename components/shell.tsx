import Link from 'next/link'
import { LayoutDashboard,CalendarDays,UsersRound,Scissors,UserRound,Wallet,Settings,LogOut,Shield } from 'lucide-react'
import { context } from '@/lib/access'
import { logout } from '@/app/actions'
const items=[['/dashboard','Vue d’ensemble',LayoutDashboard],['/agenda','Agenda',CalendarDays],['/clients','Clients',UsersRound],['/prestations','Prestations',Scissors],['/equipe','Équipe',UserRound],['/finances','Finances',Wallet],['/parametres','Paramètres',Settings]] as const
export async function Shell({children,title,subtitle}:{children:React.ReactNode,title:string,subtitle?:string}) {
  const {salon,role,user,db}=await context()
  const {data:admin}=await db.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle()
  return <div className="app-shell"><aside className="sidebar"><Link href="/dashboard" className="brand"><span className="brand-mark">c<span>.</span></span><span>ciseo<span className="brand-dot">.</span></span></Link>
    <div className="salon-tag"><span className="salon-icon">✂</span><span><strong>{salon.name}</strong><small>{role==='owner'?'Propriétaire':role==='manager'?'Manager':'Équipe'}</small></span></div>
    <p className="nav-caption">ESPACE DE TRAVAIL</p><nav>{items.filter(([href])=>role!=='employee'||!['/prestations','/equipe','/finances','/parametres'].includes(href)).map(([href,label,Icon])=><Link key={href} href={href} className="nav-link"><Icon size={19}/>{label}</Link>)}</nav>
    <div className="sidebar-bottom">{admin&&<Link href="/admin" className="nav-link"><Shield size={19}/> Administration</Link>}<form action={logout}><button className="nav-link"><LogOut size={19}/> Se déconnecter</button></form></div>
  </aside><main className="main"><header className="topbar"><div><span className="eyebrow">ESPACE SALON / {title.toUpperCase()}</span><h1>{title}</h1>{subtitle&&<p className="muted">{subtitle}</p>}</div><Link className="button button-light top-book" href={`/reservation/${salon.slug}`} target="_blank">Voir la page de réservation ↗</Link></header><div className="main-content">{children}</div></main>
    <nav className="mobile-nav">{items.filter(([href])=>['/dashboard','/agenda','/clients','/finances'].includes(href) && (role!=='employee'||href!=='/finances')).map(([href,label,Icon])=><Link key={href} href={href}><Icon size={21}/><small>{label}</small></Link>)}<Link href="/parametres"><Settings size={21}/><small>Plus</small></Link></nav></div>
}
export function Alert({message}:{message?:string}) {return message?<div className="alert">{message}</div>:null}
