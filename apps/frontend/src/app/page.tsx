import Link from 'next/link'
import {
  Check, X, Code2, Lightbulb, ShieldAlert, LayoutDashboard,
  SlidersHorizontal, Eye, PenLine, UserCheck, Zap, ArrowRight,
} from 'lucide-react'

// ─── Icon badge component ─────────────────────────────────────
function IconBadge({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="w-11 h-11 flex items-center justify-center shrink-0 bg-black rounded-lg">
      <Icon size={20} className="text-white" strokeWidth={1.75} />
    </div>
  )
}

// ─── Data ─────────────────────────────────────────────────────

const features = [
  {
    Icon: Code2,
    tag: 'For candidates',
    title: 'Syntax & API Lookup',
    desc: 'Forgot the exact signature for heapq.nlargest? Ask freely. Candidates can query language references, standard library docs, and import syntax at any time — just like they would on the job.',
    detail: 'Covers Python, JavaScript, C++, Java, Go and more.',
  },
  {
    Icon: Lightbulb,
    tag: 'For candidates',
    title: 'Conceptual Guidance',
    desc: 'Stuck on which algorithm to reach for? The AI can explain sliding window, BFS vs DFS, dynamic programming trade-offs, or any data structure concept — without ever touching the specific problem.',
    detail: 'Explanations only. No problem-specific code.',
  },
  {
    Icon: ShieldAlert,
    tag: 'Ethics & integrity',
    title: 'Ethics Gate',
    desc: 'Every prompt is classified by intent before it reaches the model. Requests that ask the AI to solve the problem, write a complete implementation, or generate a submission are blocked instantly.',
    detail: 'Blocked intents: solve, implement, generate, optimize.',
  },
  {
    Icon: LayoutDashboard,
    tag: 'For interviewers',
    title: 'Live Monitoring Dashboard',
    desc: 'Watch the session unfold in real time. The dashboard shows a full AI prompt timeline, an assistance heatmap, copy-paste events, tab-switch alerts, and a live authenticity score.',
    detail: 'Authenticity score · Prompt replay · Violation log.',
  },
  {
    Icon: SlidersHorizontal,
    tag: 'For interviewers',
    title: 'Configurable Assistance Levels',
    desc: 'Set the rules before the session starts. Choose from four assistance levels — from a fully locked-down whiteboard to a collaborative pair-programming mode. The AI enforces your policy automatically.',
    detail: 'Per-challenge configuration. Adjustable mid-session.',
  },
  {
    Icon: Eye,
    tag: 'Anti-cheat',
    title: 'Behavioural Analysis',
    desc: 'Beyond prompt filtering, InterviewPilot tracks behavioural signals: suspicious copy-paste bursts, rapid tab switches, gaze deviation via webcam, and time-to-solution consistency. Anomalies are flagged, not penalised.',
    detail: 'Powered by MediaPipe. Privacy-first by design.',
  },
]

const distinctions = [
  {
    allowed: true,
    Icon: Code2,
    label: 'Looking up syntax',
    desc: 'Checking how to use a standard library function, an import path, or a language-specific API is fair game. This is what documentation is for.',
  },
  {
    allowed: true,
    Icon: Lightbulb,
    label: 'Asking conceptual questions',
    desc: 'Understanding an algorithm, a data structure, or a design pattern is a legitimate part of problem-solving. The AI explains — it doesn\'t apply.',
  },
  {
    allowed: false,
    Icon: ShieldAlert,
    label: 'Delegating problem solving',
    desc: 'Asking the AI to solve the challenge, write the implementation, or generate a submission is blocked immediately. The thinking must stay with the candidate.',
  },
]

const levels = [
  {
    label: 'Level 0',
    name: 'No AI',
    badge: 'Strict',
    badgeDark: false,
    desc: 'Traditional whiteboard mode. The AI assistant is fully disabled. No hints, no lookups, no suggestions of any kind.',
    example: null,
  },
  {
    label: 'Level 1',
    name: 'Syntax Only',
    badge: 'Recommended',
    badgeDark: true,
    desc: 'Candidates may ask about language syntax, standard library APIs, and import statements. Conceptual and problem-solving questions are blocked.',
    example: '"How do I reverse a list in Python?"',
  },
  {
    label: 'Level 2',
    name: 'Conceptual',
    badge: 'Balanced',
    badgeDark: false,
    desc: 'Syntax lookups plus algorithm and data structure explanations. The AI can describe how BFS works but will not apply it to the specific problem.',
    example: '"When should I use a min-heap?"',
  },
  {
    label: 'Level 3',
    name: 'Pair Mode',
    badge: 'Open',
    badgeDark: false,
    desc: 'The AI acts as a pair programmer — suggesting small code snippets, pointing out edge cases, and offering refactoring ideas. Full solutions remain blocked.',
    example: '"Can you show me the loop structure for this?"',
  },
]

const howItWorks = [
  {
    step: '01',
    Icon: PenLine,
    title: 'Interviewer creates a challenge',
    desc: 'Write the problem statement, set the difficulty, choose a language, and configure the AI assistance level. Share a join link with the candidate.',
  },
  {
    step: '02',
    Icon: UserCheck,
    title: 'Candidate joins the session',
    desc: 'The candidate opens the workspace — a full Monaco editor with syntax highlighting, test runner, and the AI assistant panel — all in the browser.',
  },
  {
    step: '03',
    Icon: ShieldAlert,
    title: 'AI assists within policy',
    desc: 'Every prompt the candidate sends is classified by intent. Allowed queries get an instant answer. Blocked queries are rejected with a clear explanation.',
  },
  {
    step: '04',
    Icon: LayoutDashboard,
    title: 'Interviewer monitors live',
    desc: 'The dashboard updates in real time: AI usage timeline, authenticity score, behavioural flags, and a full replay of every prompt and response.',
  },
]


// ─── Page ─────────────────────────────────────────────────────

export default function Home() {
  return (
    <main className="bg-white text-black">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-28 border-b border-gray-100">
        <p className="text-sm uppercase tracking-widest text-gray-400 mb-6 font-medium animate-fade-in-up">
          AI-Powered Technical Interviews
        </p>
        <h1 className="text-5xl md:text-6xl lg:text-7xl max-w-4xl mb-7 leading-[1.08] animate-fade-in-up stagger-1 gradient-text">
          The interview platform<br />built for how engineers<br />actually work.
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mb-4 leading-relaxed animate-fade-in-up stagger-2">
          Real engineers look things up. They use documentation, reference APIs, and think through
          algorithms out loud. InterviewPilot lets candidates do exactly that — while guaranteeing
          the thinking stays theirs.
        </p>
        <p className="text-lg text-gray-400 max-w-xl mb-10 leading-relaxed animate-fade-in-up stagger-3">
          Interviewers get a complete picture of how a candidate reasons, not just whether they
          memorised the right answer under pressure.
        </p>
        <div className="flex flex-wrap gap-4 animate-fade-in-up stagger-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-black text-white text-base font-semibold px-8 py-4 min-h-[52px] rounded-lg hover:bg-gray-800 hover:shadow-lg active:scale-[0.97] transition-all"
          >
            Start as Interviewer <ArrowRight size={16} />
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 border-2 border-black text-black text-base font-semibold px-8 py-4 min-h-[52px] rounded-lg hover:bg-black hover:text-white active:scale-[0.97] transition-all"
          >
            Join as Candidate <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── The Distinction ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-b-2 border-gray-100">
        <div className="max-w-2xl mb-12">
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-4 font-medium">The distinction</p>
          <h2 className="text-4xl mb-5">Where the line is drawn.</h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            InterviewPilot doesn't ban AI — it defines what responsible AI use looks like in an
            interview context. The system enforces a clear boundary between assistance and outsourcing.
          </p>
        </div>

        <div className="grid md:grid-cols-3 border-2 border-gray-100 shadow-lg rounded-xl overflow-hidden">
          {distinctions.map((item, i) => (
            <div
              key={i}
              className={`px-8 py-10 transition-all duration-300 hover:bg-gray-50 hover:shadow-md cursor-default ${i < 2 ? 'border-b-2 md:border-b-0 md:border-r-2 border-gray-100' : ''}`}
            >
              {/* Icon + allowed/blocked badge */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 flex items-center justify-center bg-black rounded-lg transition-transform duration-300 hover:scale-110 hover:rotate-3">
                  <item.Icon size={18} className="text-white" strokeWidth={1.75} />
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-all duration-200 ${
                  item.allowed
                    ? 'bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-700'
                    : 'bg-black text-white hover:bg-red-600'
                }`}>
                  {item.allowed
                    ? <Check size={12} strokeWidth={2.5} />
                    : <X size={12} strokeWidth={2.5} />
                  }
                  {item.allowed ? 'Allowed' : 'Blocked'}
                </div>
              </div>
              <p className="text-lg font-bold mb-3">{item.label}</p>
              <p className="text-base text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-base text-gray-400 mt-6 italic px-1">
          "Open-book, closed-brain outsourcing." — The InterviewPilot principle.
        </p>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-b-2 border-gray-100">
        <div className="max-w-2xl mb-12">
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-4 font-medium">How it works</p>
          <h2 className="text-4xl mb-5">A session in four steps.</h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            From challenge creation to post-session review, every part of the flow is designed to
            surface genuine engineering ability.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-px bg-gray-100 shadow-lg rounded-xl overflow-hidden">
          {howItWorks.map((h) => (
            <div key={h.step} className="bg-white px-8 py-10 relative card-hover">
              <span className="cm cm-tl">+</span>
              <span className="cm cm-tr">+</span>
              <span className="cm cm-bl">+</span>
              <span className="cm cm-br">+</span>
              <div className="flex items-start gap-4 mb-5">
                <div className="w-11 h-11 flex items-center justify-center shrink-0 bg-black rounded-lg">
                  <h.Icon size={20} className="text-white" strokeWidth={1.75} />
                </div>
                <span className="text-5xl font-bold text-gray-100 leading-none mt-0.5">{h.step}</span>
              </div>
              <h3 className="text-xl font-bold mb-3">{h.title}</h3>
              <p className="text-base text-gray-500 leading-relaxed">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-b-2 border-gray-100">
        <div className="max-w-2xl mb-12">
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-4 font-medium">Features</p>
          <h2 className="text-4xl mb-5">Everything you need for a fair, modern interview.</h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            Built for engineering teams that want signal, not theatre. Every feature is designed
            around one question: does this help us understand how this person actually codes?
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-px bg-gray-100 shadow-lg rounded-xl overflow-hidden">
          {features.map((f) => (
            <div key={f.title} className="bg-white px-8 py-10 relative card-hover">
              <span className="cm cm-tl">+</span>
              <span className="cm cm-tr">+</span>
              <span className="cm cm-bl">+</span>
              <span className="cm cm-br">+</span>
              <div className="flex items-start justify-between mb-6">
                <IconBadge icon={f.Icon} />
                <span className="text-xs uppercase tracking-widest text-gray-300 font-medium pt-1">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-xl font-bold mb-3">{f.title}</h3>
              <p className="text-base text-gray-500 leading-relaxed mb-4">{f.desc}</p>
              <p className="text-sm text-gray-400 border-t border-gray-100 pt-4 font-medium">
                {f.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Assistance Levels ────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-b-2 border-gray-100">
        <div className="max-w-2xl mb-12">
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-4 font-medium">Assistance levels</p>
          <h2 className="text-4xl mb-5">Set the rules before the session starts.</h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            Every challenge has a configurable AI assistance level. Interviewers choose the policy;
            the platform enforces it automatically. No manual monitoring required.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 shadow-lg rounded-xl overflow-hidden">
          {levels.map((l, i) => (
            <div key={i} className="bg-white px-6 py-8 relative flex flex-col card-hover">
              <span className="cm cm-tl">+</span>
              <span className="cm cm-tr">+</span>
              <span className="cm cm-bl">+</span>
              <span className="cm cm-br">+</span>

              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">{l.label}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 ${
                  l.badgeDark ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {l.badge}
                </span>
              </div>

              <p className="text-xl font-bold mb-3">{l.name}</p>
              <p className="text-sm text-gray-500 leading-relaxed mb-4 flex-1">{l.desc}</p>

              {l.example && (
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-4 italic">
                  e.g. {l.example}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="border-2 border-gray-100 px-10 py-16 md:px-16 md:py-20 relative rounded-2xl shadow-xl">
          <span className="cm cm-tl">+</span>
          <span className="cm cm-tr">+</span>
          <span className="cm cm-bl">+</span>
          <span className="cm cm-br">+</span>

          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-black flex items-center justify-center rounded-lg">
              <Zap size={18} className="text-white" strokeWidth={1.75} />
            </div>
            <p className="text-sm uppercase tracking-widest text-gray-400 font-medium">Get started</p>
          </div>

          <h2 className="text-4xl md:text-5xl mb-5 max-w-2xl leading-tight">
            Stop testing memory.<br />Start evaluating engineers.
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mb-10 leading-relaxed">
            InterviewPilot is free to try. Create a challenge, invite a candidate, and run your
            first AI-assisted interview in under five minutes.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-black text-white text-base font-semibold px-8 py-4 min-h-[52px] rounded-lg hover:bg-gray-800 hover:shadow-lg active:scale-[0.97] transition-all"
            >
              I'm an Interviewer <ArrowRight size={16} />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 border-2 border-black text-black text-base font-semibold px-8 py-4 min-h-[52px] rounded-lg hover:bg-black hover:text-white active:scale-[0.97] transition-all"
            >
              I'm a Candidate <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

    </main>
  )
}
