import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response
  const client = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      }
    }
  })
  await client.auth.getUser()
  return response
}
export const config = { matcher: ['/dashboard/:path*','/agenda/:path*','/clients/:path*','/prestations/:path*','/equipe/:path*','/finances/:path*','/parametres/:path*','/admin/:path*'] }
