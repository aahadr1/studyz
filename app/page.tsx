import { redirect } from 'next/navigation'

export default function Home() {
  // Server-side redirect to login
  redirect('/login')
}

