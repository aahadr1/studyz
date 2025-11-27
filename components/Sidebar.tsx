'use client'

import { useRouter, usePathname } from 'next/navigation'
import { FiBook, FiLogOut, FiHome } from 'react-icons/fi'
import { signOut } from '@/lib/auth'

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const navItems = [
    { icon: FiHome, label: 'Dashboard', href: '/dashboard' },
    { icon: FiBook, label: 'Lessons', href: '/lessons' },
  ]

  return (
    <div className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-primary-600">Studyz</h1>
        <p className="text-sm text-gray-500 mt-1">AI Study Assistant</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-primary-50 text-primary-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition"
        >
          <FiLogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  )
}

