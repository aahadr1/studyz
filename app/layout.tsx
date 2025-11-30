import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Studyz - Smart Study Assistant',
  description: 'Study smarter with AI-powered document analysis and conversational assistance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
