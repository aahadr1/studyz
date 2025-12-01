'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLogOut, FiHome, FiBook, FiCheckSquare, FiPlus, FiArrowRight, FiTrash2, FiEdit2 } from 'react-icons/fi'
import Link from 'next/link'

interface McqSet {
  id: string
  name: string
  source_pdf_name: string
  total_pages: number
  total_questions: number
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

        // Load MCQ sets
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 sidebar flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border">
          <span className="text-lg font-semibold text-text-primary">Studyz</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <div className="sidebar-section-title">Menu</div>
          <Link href="/dashboard" className="sidebar-item">
            <FiHome className="w-4 h-4" />
            <span className="text-sm">Dashboard</span>
          </Link>
          <Link href="/lessons" className="sidebar-item">
            <FiBook className="w-4 h-4" />
            <span className="text-sm">Interactive Lessons</span>
          </Link>
          <Link href="/mcq" className="sidebar-item sidebar-item-active">
            <FiCheckSquare className="w-4 h-4" />
            <span className="text-sm">MCQ Sets</span>
          </Link>
          <Link href="/mcq/new" className="sidebar-item">
            <FiPlus className="w-4 h-4" />
            <span className="text-sm">New MCQ</span>
          </Link>
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-accent rounded-md flex items-center justify-center text-white text-sm font-medium">
              {user?.fullName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.fullName || 'Loading...'}
              </p>
              <p className="text-xs text-text-tertiary truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-text-tertiary hover:text-error"
          >
            <FiLogOut className="w-4 h-4" />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-8">
          <h1 className="text-lg font-semibold text-text-primary">MCQ Sets</h1>
          <Link href="/mcq/new" className="btn-primary">
            <FiPlus className="w-4 h-4" />
            New MCQ Set
          </Link>
        </header>

        {/* Content */}
        <div className="p-8 max-w-4xl">
          {isLoading ? (
            <div className="text-center py-12 text-text-secondary">Loading...</div>
          ) : mcqSets.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiCheckSquare className="w-6 h-6 text-text-tertiary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                No MCQ sets yet
              </h3>
              <p className="text-text-secondary max-w-sm mx-auto mb-4">
                Upload a PDF with multiple choice questions to create your first MCQ set.
              </p>
              <Link href="/mcq/new" className="btn-primary inline-flex">
                <FiPlus className="w-4 h-4" />
                Create Your First MCQ Set
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {mcqSets.map((set) => (
                <div key={set.id} className="card p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FiCheckSquare className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-text-primary truncate">{set.name}</h4>
                    <p className="text-sm text-text-tertiary">
                      {set.total_questions} question{set.total_questions !== 1 ? 's' : ''} · {set.total_pages} page{set.total_pages !== 1 ? 's' : ''} · {formatDate(set.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/mcq/${set.id}/edit`}
                      className="p-2 hover:bg-elevated rounded-lg transition-colors text-text-tertiary hover:text-accent"
                      title="Edit questions"
                    >
                      <FiEdit2 className="w-5 h-5" />
                    </Link>
                    {deleteConfirm === set.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDelete(set.id)}
                          className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1 bg-elevated text-text-secondary text-sm rounded-lg hover:bg-border"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(set.id)}
                        className="p-2 hover:bg-elevated rounded-lg transition-colors text-text-tertiary hover:text-red-500"
                        title="Delete set"
                      >
                        <FiTrash2 className="w-5 h-5" />
                      </button>
                    )}
                    <Link
                      href={`/mcq/${set.id}`}
                      className="p-2 hover:bg-elevated rounded-lg transition-colors text-text-tertiary hover:text-accent"
                      title="Practice"
                    >
                      <FiArrowRight className="w-5 h-5" />
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

