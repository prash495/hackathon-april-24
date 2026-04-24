import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export default function Input({ label, error, hint, className = '', id, ...props }: InputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-gray-700 tracking-wide"
      >
        {label}
      </label>

      <input
        id={inputId}
        className={[
          'w-full border-2 rounded-none px-4 py-3 text-base',
          'focus:outline-none transition-colors',
          'placeholder:text-gray-300',
          'min-h-[48px]',
          error
            ? 'border-red-400 focus:border-red-600 bg-red-50'
            : 'border-gray-300 focus:border-black bg-white',
          className,
        ].join(' ')}
        {...props}
      />

      {hint && !error && (
        <p className="text-sm text-gray-400">{hint}</p>
      )}
      {error && (
        <p className="text-sm text-red-600 font-medium">{error}</p>
      )}
    </div>
  )
}
