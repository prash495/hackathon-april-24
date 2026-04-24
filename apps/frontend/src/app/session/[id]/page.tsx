'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Message = { role: 'user' | 'assistant'; content: string; allowed?: boolean }

export default function SessionPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [code, setCode] = useState('# Write your solution here\n')
  const [prompt, setPrompt] = useState('')
  const [chat, setChat] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  const send = async () => {
    if (!prompt.trim() || loading) return
    const userMsg = prompt.trim()
    setPrompt('')
    setLoading(true)
    setChat(c => [...c, { role: 'user', content: userMsg }])

    try {
      const res = await fetch('http://localhost:8000/ai/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg, session_id: sessionId }),
      })
      const data = await res.json()
      setChat(c => [...c, {
        role: 'assistant',
        content: data.allowed ? data.response : data.violation,
        allowed: data.allowed,
      }])
    } catch {
      setChat(c => [...c, { role: 'assistant', content: 'Connection error.', allowed: false }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-[calc(100vh-56px)] flex bg-white text-black overflow-hidden">

      {/* Left: Problem */}
      <div className="w-72 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs uppercase tracking-widest text-gray-400">Problem</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h2 className="font-semibold text-sm mb-3">Two Sum</h2>
          <p className="text-gray-500 text-xs leading-relaxed mb-4">
            Given an array of integers and a target, return indices of two numbers that add up to the target.
          </p>
          <div className="border border-gray-100 p-3">
            <p className="text-xs text-gray-400 mb-1">Example</p>
            <pre className="text-xs font-mono text-gray-600">
{`Input: [2,7,11,15], 9
Output: [0,1]`}
            </pre>
          </div>
        </div>
      </div>

      {/* Middle: Editor */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400 font-mono">solution.py</p>
          <button className="text-xs bg-black text-white px-3 py-1.5 hover:bg-gray-800 transition-colors">
            Run Tests
          </button>
        </div>
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage="python"
            theme="light"
            value={code}
            onChange={v => setCode(v || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16 },
              fontFamily: 'JetBrains Mono, Menlo, monospace',
            }}
          />
        </div>
      </div>

      {/* Right: AI Chat */}
      <div className="w-72 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-gray-400">AI Assistant</p>
          <span className="text-xs text-gray-300 border border-gray-200 px-2 py-0.5">Syntax Only</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {chat.length === 0 && (
            <p className="text-xs text-gray-300 text-center mt-8">Ask about syntax or concepts</p>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`${m.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div
                className={`inline-block max-w-[90%] px-3 py-2 text-xs leading-relaxed
                  ${m.role === 'user'
                    ? 'bg-black text-white'
                    : m.allowed === false
                    ? 'border border-red-200 text-red-600 bg-red-50'
                    : 'border border-gray-200 text-gray-700'
                  }`}
              >
                {m.allowed === false && <span className="block text-xs font-medium mb-1">⚠ Blocked</span>}
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-left">
              <div className="inline-block border border-gray-200 px-3 py-2 text-xs text-gray-400">
                Thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-3">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask about syntax or concepts..."
            rows={3}
            className="w-full text-xs border border-gray-200 px-3 py-2 resize-none focus:outline-none focus:border-black transition-colors placeholder:text-gray-300"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
          <button
            onClick={send}
            disabled={loading}
            className="mt-2 w-full bg-black text-white py-2 text-xs font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>

    </div>
  )
}
