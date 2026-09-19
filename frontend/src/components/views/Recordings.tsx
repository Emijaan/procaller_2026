import React, { useState } from 'react';
import { Card, Badge, Avatar, Button, Drawer } from '../ui/index';
import { recordings } from '../../data/mock';

export default function Recordings() {
  const [active, setActive] = useState<typeof recordings[0] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(33);
  const [speed, setSpeed] = useState('1x');

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
            <option>All Agents</option>
            <option>Rahul Sharma</option>
            <option>Anjali Mehta</option>
          </select>
          <select className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
            <option>All Campaigns</option>
            <option>Delhi Real Estate</option>
            <option>Hyderabad SaaS</option>
          </select>
          <input type="date" className="h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none" />
        </div>

        {/* Recording cards */}
        {recordings.map(rec => (
          <Card key={rec.id} className={`p-5 cursor-pointer hover:shadow-md transition-all ${active?.id === rec.id ? 'border-[#4F46E5] bg-[#F8FAFF]' : ''}`}>
            <div className="flex items-start gap-4">
              {/* Play button */}
              <button
                onClick={() => { setActive(rec); setPlaying(true); }}
                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-all ${active?.id === rec.id && playing ? 'bg-[#4F46E5] shadow-indigo-200' : 'bg-slate-100 hover:bg-[#4F46E5] hover:text-white group'} text-slate-600`}
              >
                {active?.id === rec.id && playing ? (
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className="wave-bar h-4 bg-white" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">{rec.customer}</p>
                    <p className="text-xs text-slate-400">{rec.agent} · {rec.campaign} · {rec.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={rec.sentiment === 'Positive' ? 'success' : rec.sentiment === 'Negative' ? 'danger' : 'muted'}>
                      {rec.sentiment === 'Positive' ? '😊' : rec.sentiment === 'Negative' ? '😞' : '😐'} {rec.sentiment}
                    </Badge>
                    <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded">{rec.duration}</span>
                  </div>
                </div>

                {/* Waveform */}
                <div
                  className="h-8 bg-slate-50 rounded-lg mb-3 relative overflow-hidden cursor-pointer"
                  onClick={() => setActive(rec)}
                >
                  <div className="absolute inset-0 flex items-center gap-0.5 px-2">
                    {Array.from({ length: 80 }, (_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full ${i / 80 < progress / 100 ? 'bg-[#4F46E5]' : 'bg-slate-200'}`}
                        style={{ height: `${20 + Math.sin(i * 0.4) * 12 + Math.random() * 8}px` }}
                      />
                    ))}
                  </div>
                </div>

                {/* AI Summary */}
                <div className="flex items-start gap-2 mb-3 bg-purple-50 rounded-xl p-3 border border-purple-100">
                  <span className="w-5 h-5 rounded bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">AI</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-purple-900 mb-1">AI Summary</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{rec.aiSummary}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {rec.keyTopics.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                    </div>
                  </div>
                </div>

                {/* Action items */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Action Items</p>
                    <div className="space-y-1">
                      {rec.actionItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-green-500 text-xs shrink-0">→</span>
                          <p className="text-xs text-slate-600">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">QA Score</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#4F46E5] rounded-full" style={{ width: `${rec.score}%` }} />
                      </div>
                      <span className="text-sm font-bold text-[#4F46E5]">{rec.score}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">AI Suggested: <span className="font-medium text-slate-600">{rec.suggestedDisposition}</span></p>
                  </div>
                </div>
              </div>

              {/* View full */}
              <Button variant="ghost" size="sm" onClick={() => setActive(rec)}>
                Transcript →
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Transcript Drawer */}
      <Drawer open={!!active} onClose={() => { setActive(null); setPlaying(false); }} title="AI Call Intelligence" width="max-w-xl">
        {active && (
          <div className="space-y-6">
            {/* Player */}
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setPlaying(!playing)}
                  className="w-10 h-10 rounded-full bg-[#4F46E5] flex items-center justify-center text-white shadow-lg shadow-indigo-200"
                >
                  {playing ? '⏸' : '▶'}
                </button>
                <div className="flex-1">
                  <div className="h-1.5 bg-slate-200 rounded-full relative cursor-pointer" onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setProgress(Math.round(((e.clientX - rect.left) / rect.width) * 100));
                  }}>
                    <div className="h-full bg-[#4F46E5] rounded-full transition-all" style={{ width: `${progress}%` }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#4F46E5] rounded-full -ml-1.5 transition-all" style={{ left: `${progress}%` }} />
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-500">{active.duration}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {['0.75x','1x','1.25x','1.5x','2x'].map(s => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`text-xs px-2 py-1 rounded transition-all ${speed === s ? 'bg-[#4F46E5] text-white' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold">AI</span>
                <span className="text-sm font-semibold text-purple-900">Summary</span>
                <Badge variant="muted" className="ml-auto">AI Generated</Badge>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{active.aiSummary}</p>
            </div>

            {/* Transcript */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Transcript</h4>
              <div className="space-y-3">
                {[
                  { speaker: 'Agent', time: '00:00', text: `Good morning! This is ${active.agent} from ProCaller. Am I speaking with ${active.customer}?`, agent: true },
                  { speaker: 'Customer', time: '00:05', text: 'Yes, speaking. Good morning.', agent: false },
                  { speaker: 'Agent', time: '00:08', text: 'Great! I\'m calling to follow up on your interest in our enterprise calling solution. Do you have a few minutes?', agent: true },
                  { speaker: 'Customer', time: '00:15', text: 'Sure, I\'ve been looking at the pricing. Can you walk me through the premium plan?', agent: false },
                  { speaker: 'Agent', time: '00:22', text: 'Absolutely! The premium plan includes unlimited outbound calls, AI transcription, call coaching, and dedicated support...', agent: true },
                ].map((line, i) => (
                  <div key={i} className={`flex gap-3 ${line.agent ? '' : 'flex-row-reverse'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${line.agent ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      {line.speaker[0]}
                    </div>
                    <div className={`max-w-[80%] ${line.agent ? '' : 'text-right'}`}>
                      <div className={`flex items-center gap-2 mb-1 ${line.agent ? '' : 'flex-row-reverse'}`}>
                        <span className="text-xs font-medium text-slate-700">{line.speaker}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{line.time}</span>
                      </div>
                      <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${line.agent ? 'bg-indigo-50 text-slate-700 rounded-tl-none' : 'bg-slate-100 text-slate-700 rounded-tr-none'}`}>
                        {line.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action items */}
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-800 mb-2">Action Items</p>
              {active.actionItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input type="checkbox" className="rounded accent-green-500" />
                  <span className="text-sm text-slate-700">{item}</span>
                </div>
              ))}
            </div>

            <Button variant="primary" size="md" className="w-full">Apply AI Suggested Disposition</Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
