'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const LEVELS = [
  { value: 0, label: 'Level 0', name: 'No AI',       desc: 'Traditional whiteboard' },
  { value: 1, label: 'Level 1', name: 'Syntax Only', desc: 'Language references only' },
  { value: 2, label: 'Level 2', name: 'Conceptual',  desc: 'Algorithm hints allowed' },
  { value: 3, label: 'Level 3', name: 'Pair Mode',   desc: 'Small snippets, no solutions' },
]

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export default function CreateChallenge() {
  const router = useRouter()
  const { user, isLoading } = useRequireAuth('interviewer')

  const [form, setForm] = useState({
    title: '',
    description: '',
    difficulty: 'medium' as typeof DIFFICULTIES[number],
    assistance_level: 1 as number,
    starter_code: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'Title is required'
    if (!form.description.trim()) e.description = 'Description is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      await api.post('/challenges', form)
      router.push('/interviewer')
    } catch {
      setErrors({ submit: 'Failed to create challenge. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* ── Page header ──────────────────────────────────── */}
        <div className="mb-10 pb-8 border-b-2 border-gray-100">
          <Link
            href="/interviewer"
            className="inline-flex items-center gap-1.5 text-base text-gray-400 hover:text-black font-medium mb-5 min-h-[44px]"
          >
            ← Back to dashboard
          </Link>
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-2 font-medium">New challenge</p>
          <h1 className="text-4xl">Create Challenge</h1>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-10">

            {/* ── Basic info ───────────────────────────────── */}
            <section>
              <h2 className="text-xl font-bold mb-5 pb-3 border-b border-gray-100">Basic Info</h2>
              <div className="space-y-5">
                <Input
                  label="Challenge title"
                  type="text"
                  placeholder="e.g. Two Sum"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  error={errors.title}
                />
                <div>
                  <label className="block text-sm font-semibold text-gray-700 tracking-wide mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                    placeholder="Describe the problem clearly. Include constraints and examples."
                    rows={5}
                    className={[
                      'w-full border-2 px-4 py-3 text-base resize-none',
                      'focus:outline-none transition-colors placeholder:text-gray-300',
                      errors.description
                        ? 'border-red-400 focus:border-red-600 bg-red-50'
                        : 'border-gray-300 focus:border-black',
                    ].join(' ')}
                  />
                  {errors.description && (
                    <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.description}</p>
                  )}
                </div>
              </div>
            </section>

            {/* ── Difficulty ───────────────────────────────── */}
            <section>
              <h2 className="text-xl font-bold mb-5 pb-3 border-b border-gray-100">Difficulty</h2>
              <div className="grid grid-cols-3 gap-3">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('difficulty', d)}
                    className={[
                      'py-4 text-base font-semibold capitalize border-2 min-h-[56px]',
                      'transition-all duration-150 active:scale-[0.98]',
                      form.difficulty === d
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
                    ].join(' ')}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </section>

            {/* ── AI Assistance Level ──────────────────────── */}
            <section>
              <h2 className="text-xl font-bold mb-2 pb-3 border-b border-gray-100">AI Assistance Level</h2>
              <p className="text-base text-gray-500 mb-5">
                Controls what kind of AI help candidates can request during this challenge.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {LEVELS.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => set('assistance_level', l.value)}
                    className={[
                      'flex flex-col items-start px-5 py-5 border-2 text-left',
                      'transition-all duration-150 active:scale-[0.98] min-h-[90px]',
                      form.assistance_level === l.value
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold uppercase tracking-widest ${
                        form.assistance_level === l.value ? 'text-gray-400' : 'text-gray-400'
                      }`}>
                        {l.label}
                      </span>
                    </div>
                    <span className="text-base font-bold">{l.name}</span>
                    <span className={`text-sm mt-0.5 ${
                      form.assistance_level === l.value ? 'text-gray-300' : 'text-gray-400'
                    }`}>
                      {l.desc}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* ── Starter Code ─────────────────────────────── */}
            <section>
              <h2 className="text-xl font-bold mb-2 pb-3 border-b border-gray-100">
                Starter Code{' '}
                <span className="text-base font-normal text-gray-400">(optional)</span>
              </h2>
              <p className="text-base text-gray-500 mb-5">
                Pre-fill the editor with a function signature or boilerplate.
              </p>
              <textarea
                value={form.starter_code}
                onChange={e => set('starter_code', e.target.value)}
                placeholder={'def solution(nums: list[int], target: int) -> list[int]:\n    pass'}
                rows={7}
                className="w-full border-2 border-gray-300 focus:border-black focus:outline-none px-4 py-3 text-base font-mono resize-none placeholder:text-gray-300 transition-colors"
              />
            </section>

            {/* ── Submit error ─────────────────────────────── */}
            {errors.submit && (
              <div className="border-2 border-red-300 bg-red-50 px-5 py-4 text-base text-red-700 font-medium">
                {errors.submit}
              </div>
            )}

            {/* ── Actions ──────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" loading={submitting} size="lg">
                {submitting ? 'Creating…' : 'Create Challenge'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>

          </div>
        </form>
      </div>
    </main>
  )
}
