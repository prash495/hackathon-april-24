import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  children: React.ReactNode
}

export default function Button({
  loading,
  variant = 'primary',
  size = 'md',
  fullWidth,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const sizes = {
    sm: 'px-4 py-2 text-sm min-h-[38px]',
    md: 'px-6 py-3 text-base min-h-[48px]',
    lg: 'px-8 py-4 text-lg min-h-[56px]',
  }

  const variants = {
    primary: [
      'bg-black text-white font-semibold',
      'hover:bg-gray-800 active:bg-gray-900 active:scale-[0.98]',
      'disabled:bg-gray-300 disabled:text-gray-500',
    ].join(' '),
    outline: [
      'border-2 border-black text-black font-semibold bg-white',
      'hover:bg-black hover:text-white active:scale-[0.98]',
      'disabled:border-gray-300 disabled:text-gray-400',
    ].join(' '),
    ghost: [
      'text-gray-600 font-medium underline underline-offset-4',
      'hover:text-black active:text-gray-800',
      'disabled:text-gray-300',
    ].join(' '),
  }

  return (
    <button
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2',
        'cursor-pointer select-none',
        'transition-all duration-150',
        'disabled:cursor-not-allowed',
        sizes[size],
        variants[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {children}
    </button>
  )
}
