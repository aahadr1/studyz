'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLogOut, FiHome, FiBook, FiCheckSquare, FiPlus, FiArrowRight, FiTrash2, FiEdit2, FiZap, FiMic } from 'react-icons/fi'
import Link from 'next/link'
import Logo from '@/components/Logo'

interface McqSet {
  id: string
  name: string
  source_pdf_name: string
  total_pages: number
  total_questions: number
  is_corrected?: boolean
  created_at: string
}

export default function MCQSetsPage() {
  const [user, setUser] = useState<any>(null)
  const [mcqSets, setMcqSets] = useState<McqSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !authUser) {
          window.location.href = '/login'
          return
        }

        setUser({
          email: authUser.email,
          fullName: authUser.user_metadata?.full_name || 'Student',
        })

        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const response = await fetch('/api/mcq/list', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })
          if (response.ok) {
            const data = await response.json()
            setMcqSets(data.sets || [])
          }
        }
      } catch (err: any) {
        console.error('Error loading MCQ sets:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const handleDelete = async (setId: string) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) return

    try {
      const response = await fetch(`/api/mcq/${setId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        setMcqSets(mcqSets.filter(s => s.id !== setId))
      }
    } catch (err) {
      console.error('Error deleting MCQ set:', err)
    }
    
    setDeleteConfirm(null)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Logo size="md" href="/dashboard" />
        </div>

        <nav className="flex-1 py-4">
          <div className="sidebar-section-title">Menu</div>
          <Link href="/dashboard" className="sidebar-item">
            <FiHome className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Dashboard</span>
          </Link>
          <Link href="/lessons" className="sidebar-item">
            <FiBook className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Lessons</span>
          </Link>
          <Link href="/interactive-lessons" className="sidebar-item">
            <FiZap className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Interactive</span>
          </Link>
          <Link href="/mcq" className="sidebar-item sidebar-item-active">
            <FiCheckSquare className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Quiz Sets</span>
          </Link>
          <Link href="/intelligent-podcast" className="sidebar-item">
            <FiMic className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Podcasts</span>
          </Link>
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 border border-border flex items-center justify-center text-sm font-medium mono">
              {user?.fullName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.fullName || 'Loading...'}
              </p>
              <p className="text-xs text-text-tertiary truncate mono">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-text-tertiary hover:text-error"
          >
            <FiLogOut className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-border flex items-center justify-between px-8">
          <h1 className="text-sm font-medium text-text-primary uppercase tracking-wider">Quiz Sets</h1>
          <Link href="/mcq/new" className="btn-primary">
            <FiPlus className="w-4 h-4" strokeWidth={1.5} />
            New Quiz
          </Link>
        </header>

        <div className="p-8 max-w-4xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : mcqSets.length === 0 ? (
            <div className="border border-border p-10 text-center">
              <div className="w-12 h-12 border border-border flex items-center justify-center mx-auto mb-4 text-text-tertiary">
                <FiCheckSquare className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h3 className="font-medium text-text-primary mb-2">No quiz sets yet</h3>
              <p className="text-sm text-text-secondary mb-6 max-w-xs mx-auto">
                Upload a PDF with multiple choice questions to create your first quiz set.
              </p>
              <Link href="/mcq/new" className="btn-primary inline-flex">
                <FiPlus className="w-4 h-4" strokeWidth={1.5} />
                Create Quiz
              </Link>
            </div>
          ) : (
            <div className="border border-border divide-y divide-border">
              {mcqSets.map((set) => (
                <div key={set.id} className="flex items-center justify-between p-4 hover:bg-elevated transition-colors">
                  <Link
                    href={`/mcq/${set.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className="w-10 h-10 border border-border flex items-center justify-center text-text-tertiary">
                      <FiCheckSquare className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                    <h4 className="font-medium text-text-primary truncate">{set.name}</h4>
                        {set.is_corrected && (
                          <span className="text-[9px] uppercase tracking-wider border border-success/30 text-success px-1.5 py-0.5">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-tertiary mono">
                        {set.total_questions} questions · {new Date(set.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/mcq/${set.id}/edit`}
                      className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      <FiEdit2 className="w-4 h-4" strokeWidth={1.5} />
                    </Link>
                    {deleteConfirm === set.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDelete(set.id)}
                          className="px-3 py-1.5 bg-error text-white text-xs uppercase tracking-wider"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1.5 border border-border text-text-secondary text-xs uppercase tracking-wider hover:bg-elevated"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(set.id)}
                        className="p-2 text-text-tertiary hover:text-error transition-colors"
                      >
                        <FiTrash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    )}
                    <Link
                      href={`/mcq/${set.id}`}
                      className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
