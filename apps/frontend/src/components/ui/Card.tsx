import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  icon?: React.ReactNode
  accent?: boolean
}

export default function Card({ children, className = '', icon, accent = false }: CardProps) {
  return (
    <div
      className={`
        relative border border-gray-200 p-8
        ${accent ? 'bg-black text-white' : 'bg-white text-black'}
        ${className}
      `}
    >
      {/* Corner marks */}
      <span className="absolute top-[-1px] left-[-1px] text-gray-300 text-xs leading-none select-none">+</span>
      <span className="absolute top-[-1px] right-[-1px] text-gray-300 text-xs leading-none select-none">+</span>
      <span className="absolute bottom-[-1px] left-[-1px] text-gray-300 text-xs leading-none select-none">+</span>
      <span className="absolute bottom-[-1px] right-[-1px] text-gray-300 text-xs leading-none select-none">+</span>

      {icon && (
        <div className={`w-10 h-10 flex items-center justify-center mb-6 ${accent ? 'bg-white/10' : 'bg-black'}`}>
          <span className={accent ? 'text-white' : 'text-white'}>{icon}</span>
        </div>
      )}
      {children}
    </div>
  )
}
