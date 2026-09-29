import type { Metadata } from 'next'
import './globals.css'
export const metadata:Metadata={title:'Ciseo — la gestion du salon, simplement',description:'Agenda, clients, prestations et finances pour salons de coiffure.'}
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="fr"><body>{children}</body></html> }
