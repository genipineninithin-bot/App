import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  Globe,
  Plus,
  RotateCcw,
  Send,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  AiKnowledgeEntry,
  CyberThreat,
  DisasterForecast,
  IncidentTicket,
  UserRole,
} from '../../types/modules';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantModuleProps {
  forecasts: DisasterForecast[];
  threats: CyberThreat[];
  incidents: IncidentTicket[];
  aiKnowledge: AiKnowledgeEntry[];
  aiModel?: string;
  userRole?: UserRole;
  onSaveKnowledge?: (entry: AiKnowledgeEntry) => Promise<void>;
  onDeleteKnowledge?: (id: string) => Promise<void>;
}

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Spanish', 'Japanese', 'French', 'Arabic'];

const CATEGORY_PROMPTS = [
  {
    label: 'Flood',
    prompt: 'Provide immediate flood safety steps, high-ground evacuation triggers, and electrical hazard warnings.',
  },
  {
    label: 'Earthquake',
    prompt: 'What are the Drop-Cover-Hold-On steps, aftershock rules, and structural gas-leak checks after an earthquake?',
  },
  {
    label: 'Cyclone',
    prompt: 'Give a cyclone & storm-surge preparation checklist including shelter-in-place and window reinforcement.',
  },
  {
    label: 'Fire',
    prompt: 'Provide wildfire evacuation readiness, smoke protection, and emergency exit procedures.',
  },
  {
    label: 'First Aid',
    prompt: 'Provide step-by-step first-aid instructions for severe bleeding, burns, and crush injuries.',
  },
  {
    label: 'Phishing',
    prompt: 'How do citizens and rescue teams verify relief links and spot emergency phishing SMS attacks?',
  },
];

const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'Nexora AI Assistant online. Ask for multilingual emergency guidance, first-aid steps, disaster preparedness checklists, or cybersecurity awareness briefings.',
};

const SAFETY_CHECKLISTS = [
  { id: 'ck-water', category: 'Disaster Prep', text: 'Store 3-day potable water (4L per person daily) & sealed rations' },
  { id: 'ck-power', category: 'Disaster Prep', text: 'Charge battery banks, hand-crank radio & offline evacuation maps' },
  { id: 'ck-aid', category: 'First Aid', text: 'Verify sterile gauze, tourniquet, antiseptic & trauma shears in kit' },
  { id: 'ck-burn', category: 'First Aid', text: 'Keep burn hydrogel dressings and emergency thermal blankets accessible' },
  { id: 'ck-mfa', category: 'Cyber Hygiene', text: 'Enable hardware/TOTP MFA on responder accounts; block unknown APKs' },
  { id: 'ck-url', category: 'Cyber Hygiene', text: 'Verify .gov/.org relief URLs via Module 03 before entering credentials' },
];

export const AssistantModule: React.FC<AssistantModuleProps> = ({
  forecasts,
  threats,
  incidents,
  aiKnowledge,
  aiModel,
  userRole = 'citizen',
  onSaveKnowledge,
  onDeleteKnowledge,
}) => {
  const isAdmin = userRole === 'administrator';
  const [tab, setTab] = useState<'chat' | 'checklists' | 'knowledge'>('chat');
  const [language, setLanguage] = useState('English');
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_ASSISTANT_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin KB Form State
  const [kbTopic, setKbTopic] = useState('');
  const [kbCategory, setKbCategory] = useState<AiKnowledgeEntry['category']>('Disaster');
  const [kbGuidance, setKbGuidance] = useState('');
  const [kbLang, setKbLang] = useState('English');

  const buildContextSummary = () => {
    const disasterLines = forecasts
      .map(
        (d) =>
          `- [${d.id}] ${d.title} (${d.category}, ${d.severity}, ${d.horizon}, ${d.metric})`
      )
      .join('\n');
    const threatLines = threats
      .slice(0, 4)
      .map((t) => `- [${t.id}] ${t.title} (${t.vector}, ${t.severity}, status: ${t.status})`)
      .join('\n');
    const incidentLines = incidents
      .slice(0, 4)
      .map((i) => `- [${i.id}] ${i.title} (${i.domain}, ${i.status}, unit: ${i.assignedUnit})`)
      .join('\n');

    return `Disasters:\n${disasterLines}\n\nCyber Context:\n${threatLines}\n\nIncident Queue:\n${incidentLines}`;
  };

  const buildKnowledgeContext = () =>
    aiKnowledge
      .map((k) => `[${k.category} | ${k.language}] ${k.topic}: ${k.guidance}`)
      .join('\n');

  const sendPrompt = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setErrorMsg(null);
    setIsLoading(true);
    setTab('chat');

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          contextSummary: buildContextSummary(),
          language,
          knowledgeBase: buildKnowledgeContext(),
          emergencyMode,
          model: aiModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to reach Nexora AI Assistant.';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveKnowledge || !kbTopic.trim() || !kbGuidance.trim()) return;
    await onSaveKnowledge({
      id: `KB-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      topic: kbTopic.trim(),
      category: kbCategory,
      guidance: kbGuidance.trim(),
      language: kbLang,
    });
    setKbTopic('');
    setKbGuidance('');
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Tabs + Multilingual Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 p-1 bg-[#0A0F1A] border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              tab === 'chat' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            AI Chatbot
          </button>
          <button
            type="button"
            onClick={() => setTab('checklists')}
            className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 ${
              tab === 'checklists'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Safety Checklists</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('knowledge')}
              className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 ${
                tab === 'knowledge'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>AI Knowledge Base ({aiKnowledge.length})</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEmergencyMode((v) => !v)}
            aria-pressed={emergencyMode}
            className={`min-h-[38px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
              emergencyMode
                ? 'border-red-500 bg-red-600/25 text-red-200'
                : 'border-slate-700 bg-[#0A0F1A] text-slate-300 hover:border-red-500/50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
            <span>Emergency Mode: {emergencyMode ? 'ON' : 'Off'}</span>
          </button>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <Globe className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            <span className="hidden sm:inline">Language:</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Response language"
              className="min-h-[38px] px-2.5 text-xs rounded-lg border border-slate-700 bg-[#0A0F1A] text-slate-100"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tab === 'chat' && (
        <div
          className={`flex flex-col h-[58vh] min-h-[360px] sm:h-[490px] border rounded-xl bg-[#0A0F1A] overflow-hidden ${
            emergencyMode ? 'border-red-500/60' : 'border-slate-800'
          }`}
        >
          {emergencyMode && (
            <div className="px-3.5 py-2 bg-red-950/50 border-b border-red-500/40 text-[11px] text-red-200 flex items-center justify-between gap-2">
              <span>
                <strong>Emergency Mode active:</strong> Concise step-by-step life-safety guidance enabled. Call 112 / 911 for immediate dispatch.
              </span>
            </div>
          )}
          <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 mr-1 whitespace-nowrap shrink-0">
                <Terminal className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                Topics:
              </span>
              {CATEGORY_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void sendPrompt(item.prompt)}
                  className="min-h-[34px] px-3 py-1 text-xs rounded-md border border-slate-700/80 bg-slate-900/70 text-slate-300 hover:text-white hover:border-blue-500/60 transition-colors whitespace-nowrap shrink-0"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {messages.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([INITIAL_ASSISTANT_MESSAGE]);
                  setErrorMsg(null);
                }}
                title="Clear conversation"
                className="min-h-[34px] px-2.5 py-1 text-xs rounded-md border border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800 inline-flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900 border border-slate-800 text-slate-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-xl px-4 py-3 text-xs font-mono bg-slate-900 border border-slate-800 text-slate-400">
                  Generating {language} guidance from telemetry &amp; knowledge base...
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">
                {errorMsg}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-slate-800 bg-[#080C15] flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask Nexora AI in ${language} (preparedness, first aid, cyber safety)...`}
              aria-label="Prompt Nexora AI Assistant"
              className="flex-1 min-h-[44px] px-3.5 text-sm rounded-lg border border-slate-800 bg-[#0D1422] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      )}

      {tab === 'checklists' && (
        <div className="border border-slate-800 rounded-xl bg-[#0A0F1A] divide-y divide-slate-800 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-100">Emergency Safety Checklists</span>
            <span className="font-mono text-blue-400">
              {Object.values(checkedIds).filter(Boolean).length}/{SAFETY_CHECKLISTS.length} verified
            </span>
          </div>
          {SAFETY_CHECKLISTS.map((item) => {
            const checked = Boolean(checkedIds[item.id]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setCheckedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                }
                className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-slate-900/60 transition-colors text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                  )}
                  <span className={checked ? 'line-through text-slate-500' : 'text-slate-100'}>
                    {item.text}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                  {item.category}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isAdmin && tab === 'knowledge' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddKnowledge}
            className="p-4 rounded-xl border border-slate-800 bg-[#0A0F1A] space-y-3"
          >
            <div className="text-xs font-semibold text-slate-100">
              Add Verified Guidance to AI Knowledge Base
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                minLength={3}
                value={kbTopic}
                onChange={(e) => setKbTopic(e.target.value)}
                placeholder="Knowledge topic"
                className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
              />
              <select
                value={kbCategory}
                onChange={(e) => setKbCategory(e.target.value as AiKnowledgeEntry['category'])}
                className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
              >
                <option value="Disaster">Disaster</option>
                <option value="First Aid">First Aid</option>
                <option value="Cybersecurity">Cybersecurity</option>
                <option value="Checklist">Checklist</option>
              </select>
              <select
                value={kbLang}
                onChange={(e) => setKbLang(e.target.value)}
                className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              required
              minLength={5}
              value={kbGuidance}
              onChange={(e) => setKbGuidance(e.target.value)}
              placeholder="Verified SOP or preparedness guidance injected into Nexora AI context..."
              className="w-full p-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Knowledge Entry</span>
              </button>
            </div>
          </form>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-[#0A0F1A] overflow-hidden">
            {aiKnowledge.map((k) => (
              <div key={k.id} className="p-4 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
                    <span>{k.id}</span>
                    <span>·</span>
                    <span className="text-blue-400">{k.category}</span>
                    <span>·</span>
                    <span>{k.language}</span>
                  </div>
                  <div className="font-semibold text-slate-100">{k.topic}</div>
                  <p className="text-slate-400 leading-relaxed">{k.guidance}</p>
                </div>
                {onDeleteKnowledge && (
                  <button
                    type="button"
                    onClick={() => void onDeleteKnowledge(k.id)}
                    aria-label={`Delete ${k.topic}`}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/40 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
