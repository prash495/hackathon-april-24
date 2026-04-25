'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { getToken } from '@/lib/auth'
import dynamic from 'next/dynamic'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Message = { role: 'user' | 'assistant'; content: string; allowed?: boolean }

type SessionData = {
  id: string
  status: string
  candidate_id: string | null
  challenge_id: string | null
  assistance_level: number
}

const LANGUAGES = [
  { id: 'python',     label: 'Python',     monaco: 'python',     ext: '.py',   starter: '# Write your solution here\n\ndef solution():\n    pass\n' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript', ext: '.js',   starter: '// Write your solution here\n\nfunction solution() {\n  \n}\n' },
  { id: 'cpp',        label: 'C++',        monaco: 'cpp',        ext: '.cpp',  starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n' },
  { id: 'java',       label: 'Java',       monaco: 'java',       ext: '.java', starter: 'public class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n' },
]

export default function SessionPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [session, setSession] = useState<SessionData | null>(null)
  const [lang, setLang] = useState(LANGUAGES[0])
  const [code, setCode] = useState(LANGUAGES[0].starter)
  const [stdin, setStdin] = useState('')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [chat, setChat] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [joining, setJoining] = useState(false)
  const [activeTab, setActiveTab] = useState<'output' | 'input'>('output')

  useEffect(() => {
    if (!getToken()) return
    api.get(`/sessions/${sessionId}`)
      .then(r => {
        setSession(r.data)
        setSessionStarted(r.data.status === 'active')
      })
      .catch(() => {})
  }, [sessionId])

  const switchLang = (id: string) => {
    const l = LANGUAGES.find(x => x.id === id)!
    setLang(l)
    setCode(l.starter)
    setOutput('')
  }

  const joinSession = async () => {
    setJoining(true)
    try {
      await api.post(`/sessions/${sessionId}/start`)
      setSessionStarted(true)
      setSession(s => s ? { ...s, status: 'active' } : s)
    } catch (e) { console.error('Failed to start session', e) }
    finally { setJoining(false) }
  }

  const endSession = async () => {
    try {
      await api.post(`/sessions/${sessionId}/stop`)
      setSessionStarted(false)
      setSession(s => s ? { ...s, status: 'completed' } : s)
    } catch (e) { console.error(e) }
  }

  const runCode = async () => {
    setRunning(true)
    setActiveTab('output')
    setOutput('Running...\n')
    try {
      const { data } = await api.post('/code/run', {
        code, language: lang.id, stdin,
      })
      let out = ''
      if (data.stdout) out += data.stdout
      if (data.stderr) out += (out ? '\n' : '') + data.stderr
      if (data.timed_out) out = '⏱ Execution timed out (10s limit)'
      if (!out) out = data.exit_code === 0 ? '(no output)' : `Exit code: ${data.exit_code}`
      setOutput(out)
    } catch {
      setOutput('Error: could not run code')
    } finally { setRunning(false) }
  }

  const send = async () => {
    if (!prompt.trim() || loading) return
    const userMsg = prompt.trim()
    setPrompt('')
    setLoading(true)
    setChat(c => [...c, { role: 'user', content: userMsg }])
    try {
      const { data } = await api.post('/ai/prompt', { prompt: userMsg, session_id: sessionId })
      setChat(c => [...c, {
        role: 'assistant',
        content: data.allowed ? data.response : data.violation,
        allowed: data.allowed,
      }])
    } catch {
      setChat(c => [...c, { role: 'assistant', content: 'Connection error.', allowed: false }])
    } finally { setLoading(false) }
  }

  // Pre-session
  if (!sessionStarted && session?.status !== 'completed') {
    return (
      <div className="h-[calc(100vh-56px)] flex items-center justify-center bg-white">
        <div className="text-center max-w-md px-6">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Interview Session</p>
          <h1 className="text-3xl font-semibold mb-4">Ready to begin?</h1>
          <p className="text-sm text-gray-500 mb-8">
            When you start, your camera will activate for proctoring.
            Make sure your webcam is connected and you&apos;re in a well-lit area.
          </p>
          <button onClick={joinSession} disabled={joining}
            className="bg-black text-white px-8 py-3 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
            {joining ? 'Starting...' : 'Start Interview'}
          </button>
        </div>
      </div>
    )
  }

  // Post-session
  if (session?.status === 'completed') {
    return (
      <div className="h-[calc(100vh-56px)] flex items-center justify-center bg-white">
        <div className="text-center max-w-md px-6">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Session Complete</p>
          <h1 className="text-3xl font-semibold mb-4">Interview ended</h1>
          <p className="text-sm text-gray-500">Your submission has been recorded. Thank you!</p>
        </div>
      </div>
    )
  }

  // Active session
  return (
    <div className="h-[calc(100vh-56px)] flex bg-white text-black overflow-hidden">

      {/* Left: Problem */}
      <div className="w-64 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-gray-400">Problem</p>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Live</span>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h2 className="font-semibold text-sm mb-3">Coding Challenge</h2>
          <p className="text-gray-500 text-xs leading-relaxed mb-4">
            Solve the problem below. You can use the AI assistant for syntax help.
          </p>
          <div className="text-xs text-gray-400 mt-4">
            Level {session?.assistance_level ?? 1} assistance
          </div>
        </div>
        <div className="border-t border-gray-100 px-5 py-3">
          <button onClick={endSession}
            className="w-full text-xs text-red-600 border border-red-200 px-3 py-2 hover:bg-red-50 transition-colors">
            Submit &amp; End Session
          </button>
        </div>
      </div>

      {/* Middle: Editor + Output */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={lang.id}
              onChange={e => switchLang(e.target.value)}
              className="text-xs border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:border-black"
            >
              {LANGUAGES.map(l => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-300 font-mono">solution{lang.ext}</span>
          </div>
          <button onClick={runCode} disabled={running}
            className="text-xs bg-green-600 text-white px-4 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-50 font-medium">
            {running ? '⏳ Running...' : '▶ Run Code'}
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1">
          <Editor
            height="100%"
            language={lang.monaco}
            theme="light"
            value={code}
            onChange={v => setCode(v || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              fontFamily: 'JetBrains Mono, Menlo, monospace',
            }}
          />
        </div>

        {/* Output / Input tabs */}
        <div className="border-t border-gray-200 h-40 flex flex-col">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('output')}
              className={`px-4 py-2 text-xs font-medium ${activeTab === 'output' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}
            >
              Output
            </button>
            <button
              onClick={() => setActiveTab('input')}
              className={`px-4 py-2 text-xs font-medium ${activeTab === 'input' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}
            >
              Input (stdin)
            </button>
          </div>
          {activeTab === 'output' ? (
            <pre className="flex-1 overflow-auto px-4 py-3 text-xs font-mono text-gray-700 bg-gray-50 whitespace-pre-wrap">
              {output || 'Run your code to see output here'}
            </pre>
          ) : (
            <textarea
              value={stdin}
              onChange={e => setStdin(e.target.value)}
              placeholder="Enter input for your program..."
              className="flex-1 px-4 py-3 text-xs font-mono resize-none focus:outline-none bg-gray-50 placeholder:text-gray-300"
            />
          )}
        </div>
      </div>

      {/* Right: AI Chat */}
      <div className="w-72 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-gray-400">AI Assistant</p>
          <span className="text-xs text-gray-300 border border-gray-200 px-2 py-0.5">
            Level {session?.assistance_level ?? 1}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {chat.length === 0 && (
            <p className="text-xs text-gray-300 text-center mt-8">Ask about syntax or concepts</p>
          )}
          {chat.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <div className={`inline-block max-w-[90%] px-3 py-2 text-xs leading-relaxed
                ${m.role === 'user'
                  ? 'bg-black text-white'
                  : m.allowed === false
                  ? 'border border-red-200 text-red-600 bg-red-50'
                  : 'border border-gray-200 text-gray-700'
                }`}>
                {m.allowed === false && <span className="block text-xs font-medium mb-1">⚠ Blocked</span>}
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-left">
              <div className="inline-block border border-gray-200 px-3 py-2 text-xs text-gray-400">Thinking...</div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-3">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask about syntax or concepts..."
            rows={3}
            className="w-full text-xs border border-gray-200 px-3 py-2 resize-none focus:outline-none focus:border-black transition-colors placeholder:text-gray-300"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button onClick={send} disabled={loading}
            className="mt-2 w-full bg-black text-white py-2 text-xs font-medium hover:bg-gray-800 transition-colors disabled:opacity-40">
            Send
          </button>
        </div>
      </div>

    </div>
  )
}
