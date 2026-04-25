'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Play, Send, ShieldAlert, CheckCircle, XCircle, ChevronDown } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────
type Message  = { role: 'user' | 'assistant'; content: string; allowed?: boolean }
type TestCase = { input: string; expected: string; actual?: string; passed?: boolean; status: 'idle' | 'running' | 'done' }
type Language = { id: string; label: string; monacoId: string; judge0Id: number; starter: string }

// ─── Language config ──────────────────────────────────────────
const LANGUAGES: Language[] = [
  {
    id: 'python', label: 'Python', monacoId: 'python', judge0Id: 71,
    starter: '# Write your solution here\ndef solution():\n    pass\n',
  },
  {
    id: 'javascript', label: 'JavaScript', monacoId: 'javascript', judge0Id: 63,
    starter: '// Write your solution here\nfunction solution() {\n\n}\n',
  },
  {
    id: 'cpp', label: 'C++', monacoId: 'cpp', judge0Id: 54,
    starter: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // your code\n    return 0;\n}\n',
  },
  {
    id: 'java', label: 'Java', monacoId: 'java', judge0Id: 62,
    starter: 'public class Solution {\n    public static void main(String[] args) {\n        // your code\n    }\n}\n',
  },
  {
    id: 'go', label: 'Go', monacoId: 'go', judge0Id: 60,
    starter: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello")\n}\n',
  },
]

const MOCK_TESTS: TestCase[] = [
  { input: '[2,7,11,15], target=9',  expected: '[0,1]',  status: 'idle' },
  { input: '[3,2,4], target=6',      expected: '[1,2]',  status: 'idle' },
  { input: '[3,3], target=6',        expected: '[0,1]',  status: 'idle' },
]

// ─── Component ────────────────────────────────────────────────
export default function CandidateWorkspace() {
  const { id: sessionId } = useParams<{ id: string }>()

  const [lang, setLang]         = useState<Language>(LANGUAGES[0])
  const [code, setCode]         = useState(LANGUAGES[0].starter)
  const [prompt, setPrompt]     = useState('')
  const [chat, setChat]         = useState<Message[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [tests, setTests]       = useState<TestCase[]>(MOCK_TESTS)
  const [running, setRunning]   = useState(false)
  const [pasteCount, setPasteCount] = useState(0)
  const [langOpen, setLangOpen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Scroll chat to bottom ──────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  // ── Copy-paste capture ─────────────────────────────────────
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') ?? ''
    if (!text) return
    setPasteCount(c => c + 1)
    // POST proctor event to backend
    try {
      await api.post('/proctor/event', {
        session_id: sessionId,
        event_type: 'copy_paste',
        severity:   text.length > 200 ? 'high' : 'low',
        metadata:   { paste_length: text.length },
      })
    } catch { /* non-blocking */ }
  }, [sessionId])

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  // ── Tab visibility ─────────────────────────────────────────
  useEffect(() => {
    const onVisibility = async () => {
      if (document.hidden) {
        try {
          await api.post('/proctor/event', {
            session_id: sessionId,
            event_type: 'tab_switch',
            severity:   'medium',
            metadata:   {},
          })
        } catch { /* non-blocking */ }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [sessionId])

  // ── Sync code to Supabase Realtime ─────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`session:${sessionId}`)
    const timer = setTimeout(() => {
      channel.send({
        type: 'broadcast',
        event: 'code_update',
        payload: { code, language: lang.id },
      })
    }, 800) // debounce
    return () => clearTimeout(timer)
  }, [code, lang.id, sessionId])

  // ── Language switch ────────────────────────────────────────
  const switchLang = (l: Language) => {
    setLang(l)
    setCode(l.starter)
    setLangOpen(false)
  }

  // ── Run tests via Judge0 ───────────────────────────────────
  const runTests = async () => {
    setRunning(true)
    setTests(t => t.map(tc => ({ ...tc, status: 'running', actual: undefined, passed: undefined })))

    for (let i = 0; i < tests.length; i++) {
      try {
        const res = await api.post<{ stdout: string; status: { description: string } }>(
          '/execute',
          { source_code: code, language_id: lang.judge0Id, stdin: tests[i].input }
        )
        const actual = (res.data.stdout ?? '').trim()
        const passed = actual === tests[i].expected.trim()
        setTests(t => t.map((tc, idx) =>
          idx === i ? { ...tc, actual, passed, status: 'done' } : tc
        ))
      } catch {
        setTests(t => t.map((tc, idx) =>
          idx === i ? { ...tc, actual: 'Error', passed: false, status: 'done' } : tc
        ))
      }
    }
    setRunning(false)
  }

  // ── AI chat ────────────────────────────────────────────────
  const sendPrompt = async () => {
    if (!prompt.trim() || chatLoading) return
    const msg = prompt.trim()
    setPrompt('')
    setChatLoading(true)
    setChat(c => [...c, { role: 'user', content: msg }])

    try {
      const res = await api.post<{ response: string; allowed: boolean; violation?: string }>(
        '/ai/prompt',
        { prompt: msg, session_id: sessionId }
      )
      setChat(c => [...c, {
        role: 'assistant',
        content: res.data.allowed ? res.data.response : (res.data.violation ?? 'Blocked'),
        allowed: res.data.allowed,
      }])
    } catch {
      setChat(c => [...c, { role: 'assistant', content: 'Connection error.', allowed: false }])
    } finally {
      setChatLoading(false)
    }
  }

  const passedCount = tests.filter(t => t.passed).length
  const doneCount   = tests.filter(t => t.status === 'done').length

  return (
    <div className="h-[calc(100vh-64px)] flex bg-white text-black overflow-hidden">

      {/* ── Left: Problem ──────────────────────────────────── */}
      <div className="w-72 border-r-2 border-gray-100 flex flex-col overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">Problem</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-bold text-base">Two Sum</h2>
              <span className="text-xs bg-green-50 text-green-700 font-semibold px-2 py-0.5">Easy</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed">
              Given an array of integers <code className="bg-gray-100 px-1 text-xs">nums</code> and
              an integer <code className="bg-gray-100 px-1 text-xs">target</code>, return indices of
              the two numbers such that they add up to target.
            </p>
          </div>
          <div className="border border-gray-100 p-3">
            <p className="text-xs text-gray-400 mb-2 font-medium">Example 1</p>
            <pre className="text-xs font-mono text-gray-600 leading-relaxed">{`Input:  nums=[2,7,11,15], target=9
Output: [0,1]
Reason: nums[0]+nums[1]=9`}</pre>
          </div>
          <div className="border border-gray-100 p-3">
            <p className="text-xs text-gray-400 mb-2 font-medium">Constraints</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• 2 ≤ nums.length ≤ 10⁴</li>
              <li>• -10⁹ ≤ nums[i] ≤ 10⁹</li>
              <li>• Exactly one valid answer</li>
            </ul>
          </div>
          {pasteCount > 0 && (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ {pasteCount} paste event{pasteCount > 1 ? 's' : ''} detected
            </div>
          )}
        </div>
      </div>

      {/* ── Middle: Editor + Tests ─────────────────────────── */}
      <div className="flex-1 flex flex-col border-r-2 border-gray-100 min-w-0">

        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-3">
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(o => !o)}
              className="flex items-center gap-2 border border-gray-200 px-3 py-1.5 text-sm font-medium hover:border-black transition-colors min-h-[36px]"
            >
              {lang.label}
              <ChevronDown size={14} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
            </button>
            {langOpen && (
              <div className="absolute top-full left-0 mt-1 border border-gray-200 bg-white z-20 min-w-[140px] shadow-sm">
                {LANGUAGES.map(l => (
                  <button
                    key={l.id}
                    onClick={() => switchLang(l)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${l.id === lang.id ? 'font-bold' : ''}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">solution.{lang.id === 'cpp' ? 'cpp' : lang.id === 'javascript' ? 'js' : lang.id}</span>
            <button
              onClick={runTests}
              disabled={running}
              className="inline-flex items-center gap-2 bg-black text-white px-4 py-1.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors min-h-[36px]"
            >
              <Play size={13} />
              {running ? 'Running…' : 'Run Tests'}
            </button>
          </div>
        </div>

        {/* Monaco editor */}
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language={lang.monacoId}
            theme="light"
            value={code}
            onChange={v => setCode(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16 },
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
              tabSize: 4,
            }}
          />
        </div>

        {/* Test results panel */}
        <div className="border-t-2 border-gray-100 h-44 overflow-y-auto">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">Test Results</p>
            {doneCount > 0 && (
              <span className={`text-xs font-semibold ${passedCount === doneCount ? 'text-green-600' : 'text-red-600'}`}>
                {passedCount}/{doneCount} passed
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {tests.map((t, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {t.status === 'idle'    && <div className="w-4 h-4 border border-gray-300 rounded-full" />}
                  {t.status === 'running' && <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />}
                  {t.status === 'done' && t.passed  && <CheckCircle size={16} className="text-green-600" />}
                  {t.status === 'done' && !t.passed && <XCircle     size={16} className="text-red-500" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-gray-600 truncate">Input: {t.input}</p>
                  <p className="text-xs text-gray-400">Expected: <span className="font-mono">{t.expected}</span></p>
                  {t.actual !== undefined && (
                    <p className={`text-xs font-mono ${t.passed ? 'text-green-600' : 'text-red-500'}`}>
                      Got: {t.actual}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: AI Chat ─────────────────────────────────── */}
      <div className="w-72 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">AI Assistant</p>
          <span className="text-xs border border-gray-200 px-2 py-0.5 text-gray-400">Syntax Only</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {chat.length === 0 && (
            <p className="text-xs text-gray-300 text-center mt-8 leading-relaxed">
              Ask about syntax, APIs,<br />or algorithm concepts
            </p>
          )}
          {chat.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <div className={`inline-block max-w-[92%] px-3 py-2 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-black text-white'
                  : m.allowed === false
                  ? 'border border-red-200 bg-red-50 text-red-700'
                  : 'border border-gray-200 text-gray-700'
              }`}>
                {m.allowed === false && (
                  <span className="flex items-center gap-1 font-semibold mb-1 text-red-600">
                    <ShieldAlert size={11} /> Blocked
                  </span>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="text-left">
              <div className="inline-block border border-gray-200 px-3 py-2 text-xs text-gray-400">
                Thinking…
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-gray-100 p-3">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask about syntax or concepts…"
            rows={3}
            className="w-full text-xs border border-gray-200 px-3 py-2 resize-none focus:outline-none focus:border-black transition-colors placeholder:text-gray-300"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt() } }}
          />
          <button
            onClick={sendPrompt}
            disabled={chatLoading || !prompt.trim()}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-black text-white py-2 text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            <Send size={12} /> Send
          </button>
        </div>
      </div>

    </div>
  )
}
