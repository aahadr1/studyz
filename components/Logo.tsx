'use client'

import Image from 'next/image'
import Link from 'next/link'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  href?: string
  className?: string
}

const sizes = {
  sm: { icon: 20, text: 'text-xs' },
  md: { icon: 28, text: 'text-sm' },
  lg: { icon: 36, text: 'text-base' },
  xl: { icon: 48, text: 'text-lg' },
}

export default function Logo({ 
  size = 'md', 
  showText = true, 
  href,
  className = ''
}: LogoProps) {
  const { icon, text } = sizes[size]
  
  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image 
        src="/favicon.png" 
        alt="Studyz" 
        width={icon} 
        height={icon}
        className="flex-shrink-0"
        priority
      />
      {showText && (
        <span className={`font-semibold tracking-wider ${text}`}>
          STUDYZ
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    )
  }

  return content
}

// Mobile-specific logo for headers
export function MobileLogo({ 
  size = 'sm',
  showText = true 
}: { 
  size?: 'sm' | 'md' 
  showText?: boolean 
}) {
  const iconSize = size === 'sm' ? 24 : 32
  
  return (
    <div className="flex items-center gap-2">
      <Image 
        src="/favicon.png" 
        alt="Studyz" 
        width={iconSize} 
        height={iconSize}
        className="flex-shrink-0"
        priority
      />
      {showText && (
        <span className="text-xs font-semibold tracking-wider">
          STUDYZ
        </span>
      )}
    </div>
  )
}

