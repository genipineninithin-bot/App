import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckSquare,
  Copy,
  Globe,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  StopCircle,
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
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isGreeting?: boolean;
  timestampLabel?: string;
}

interface AssistantModuleProps {
  forecasts: DisasterForecast[];
  threats: CyberThreat[];
  incidents: IncidentTicket[];
  aiKnowledge: AiKnowledgeEntry[];
  aiModel?: string;
  userId?: string;
  userRole?: UserRole;
  onSaveKnowledge?: (entry: AiKnowledgeEntry) => Promise<void>;
  onDeleteKnowledge?: (id: string) => Promise<void>;
}

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Spanish', 'Japanese', 'French', 'Arabic'];

const CATEGORY_PROMPTS = [
  {
    label: 'Flood Safety',
    prompt: 'Give simple step-by-step flood safety tips, when to leave for high ground, and how to stay safe around power outlets.',
  },
  {
    label: 'Earthquake',
    prompt: 'Explain Drop, Cover, and Hold On in simple steps, plus what to check for gas leaks after shaking stops.',
  },
  {
    label: 'Storm / Cyclone',
    prompt: 'Give an easy storm and cyclone checklist to prepare my family and home before high winds hit.',
  },
  {
    label: 'Fire Safety',
    prompt: 'Give simple wildfire evacuation tips, how to protect from smoke, and how to leave safely.',
  },
  {
    label: 'First Aid',
    prompt: 'Give clear first-aid steps for heavy bleeding, burns, and cuts while waiting for an ambulance.',
  },
  {
    label: 'Spot Scams',
    prompt: 'How can I tell if a text message or website link about emergency relief is a fake scam?',
  },
  {
    label: 'Right Now Summary',
    prompt: 'In simple words, summarize the most important disaster alerts and safety warnings right now.',
  },
];

const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  id: 'welcome-msg',
  role: 'assistant',
  isGreeting: true,
  content:
    'Hello! I am the **NEXORA AI Helper**. Ask me **anything** — everyday questions, math, coding, writing, translations, or flood, earthquake, first-aid, and scam safety help — in simple everyday words. You can also tap a quick topic above or open **Safety Checklist**.',
};

const SAFETY_CHECKLISTS = [
  { id: 'ck-water', category: 'Emergency Kit', text: 'Keep 3 days of clean drinking water (4 liters per person per day) and ready-to-eat food' },
  { id: 'ck-power', category: 'Emergency Kit', text: 'Charge phone power banks, flashlights, and a battery radio' },
  { id: 'ck-aid', category: 'First Aid', text: 'Keep clean bandages, antiseptic wipes, and scissors in a first-aid bag' },
  { id: 'ck-burn', category: 'First Aid', text: 'Keep burn gel, clean cloths, and a warm emergency blanket ready' },
  { id: 'ck-mfa', category: 'Online Safety', text: 'Turn on 2-step login verification and never install unknown phone apps' },
  { id: 'ck-url', category: 'Online Safety', text: 'Check unfamiliar relief links in Module 03 before tapping or entering passwords' },
];

const TRAINING_PRESETS: Array<{
  topic: string;
  category: AiKnowledgeEntry['category'];
  guidance: string;
}> = [
  {
    topic: 'Hospital Mass-Casualty Surge Diversion',
    category: 'First Aid',
    guidance:
      'Divert Red-Immediate trauma patients to Sendai Municipal Trauma Center when local ER occupancy exceeds 85%. Route Yellow-Delayed cases to secondary field clinics.',
  },
  {
    topic: 'Zero-Trust Responder Link Verification Drill',
    category: 'Cybersecurity',
    guidance:
      'Treat all SMS relief manifest URLs with lookalike TLDs (.eu/.xyz) or IP literals as hostile. Scan in Module 03 before opening and report IOC to SOC.',
  },
  {
    topic: 'Flash Flood Basement Breaker Isolation',
    category: 'Disaster',
    guidance:
      'Never step into standing water near live breaker panels. Use dry insulated shutoff tools if safe, evacuate upward, and notify utility crews of submerged transformers.',
  },
];

function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-slate-800/90 text-blue-300 font-mono text-[11px]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

const FormattedChatMessage: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" />;
        }
        if (/^#{1,3}\s+/.test(line)) {
          const heading = line.replace(/^#{1,3}\s+/, '');
          return (
            <div key={idx} className="font-semibold text-blue-300 pt-1">
              {renderInlineFormatting(heading)}
            </div>
          );
        }
        const numberedMatch = line.match(/^(\d+[.)])\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="font-mono text-blue-400 font-semibold shrink-0">
                {numberedMatch[1]}
              </span>
              <span className="min-w-0">{renderInlineFormatting(numberedMatch[2])}</span>
            </div>
          );
        }
        const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5">
              <span className="text-blue-400 mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="min-w-0">{renderInlineFormatting(bulletMatch[1])}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
};

export const AssistantModule: React.FC<AssistantModuleProps> = ({
  forecasts,
  threats,
  incidents,
  aiKnowledge,
  aiModel,
  userId = 'guest',
  userRole = 'citizen',
  onSaveKnowledge,
  onDeleteKnowledge,
}) => {
  const isAdmin = userRole === 'administrator';
  const chatStorageKey = `nexora_chat_v2_${userId}`;
  const customTrainingStorageKey = `nexora_custom_kb_v1_${userId}`;
  const checklistStorageKey = `nexora_checklist_v1_${userId}`;

  const [tab, setTab] = useState<'chat' | 'checklists' | 'knowledge'>('chat');
  const [language, setLanguage] = useState('English');
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [fastMode, setFastMode] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(checklistStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, boolean>;
        }
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(chatStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((m) => (m.id === 'welcome-msg' ? INITIAL_ASSISTANT_MESSAGE : m));
        }
      }
    } catch {
      // ignore storage errors
    }
    return [INITIAL_ASSISTANT_MESSAGE];
  });

  const [localTrainingEntries, setLocalTrainingEntries] = useState<AiKnowledgeEntry[]>(() => {
    try {
      const saved = localStorage.getItem(customTrainingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as AiKnowledgeEntry[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Training / KB Form State
  const [kbSearch, setKbSearch] = useState('');
  const [kbTopic, setKbTopic] = useState('');
  const [kbCategory, setKbCategory] = useState<AiKnowledgeEntry['category']>('Disaster');
  const [kbGuidance, setKbGuidance] = useState('');
  const [kbLang, setKbLang] = useState('English');
  const [kbSavedNotice, setKbSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-24)));
    } catch {
      // ignore quota errors
    }
  }, [messages, chatStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(customTrainingStorageKey, JSON.stringify(localTrainingEntries));
    } catch {
      // ignore quota errors
    }
  }, [localTrainingEntries, customTrainingStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(checklistStorageKey, JSON.stringify(checkedIds));
    } catch {
      // ignore quota errors
    }
  }, [checkedIds, checklistStorageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading, errorMsg]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const combinedKnowledge = useMemo(() => {
    const merged = [...localTrainingEntries, ...aiKnowledge];
    const q = kbSearch.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((k) =>
      `${k.topic} ${k.category} ${k.guidance} ${k.language}`.toLowerCase().includes(q)
    );
  }, [localTrainingEntries, aiKnowledge, kbSearch]);

  const buildContextSummary = () => {
    const disasterLines = forecasts
      .slice(0, 6)
      .map(
        (d) =>
          `- [${d.id}] ${d.title} (${d.category}, ${d.severity}, ${d.horizon}, ${d.metric}, region: ${d.region})`
      )
      .join('\n');
    const threatLines = threats
      .slice(0, 4)
      .map((t) => `- [${t.id}] ${t.title} (${t.vector}, ${t.severity}, status: ${t.status})`)
      .join('\n');
    const incidentLines = incidents
      .slice(0, 4)
      .map((i) => `- [${i.id}] ${i.title} (${i.domain}, ${i.status}, region: ${i.region}, unit: ${i.assignedUnit})`)
      .join('\n');

    return `Disasters:\n${disasterLines}\n\nCyber Context:\n${threatLines}\n\nIncident Queue:\n${incidentLines}`;
  };

  const buildKnowledgeContext = () =>
    [...localTrainingEntries, ...aiKnowledge]
      .map((k) => `[${k.category} | ${k.language}] ${k.topic}: ${k.guidance}`)
      .join('\n');

  const sendPrompt = async (text: string, isRetry = false) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nextMessages: ChatMessage[] = isRetry
      ? messages
      : [
          ...messages,
          {
            id: `u-${Date.now()}`,
            role: 'user',
            content: trimmed,
            timestampLabel: nowLabel,
          },
        ];

    if (!isRetry) {
      setMessages(nextMessages);
      setInput('');
    }
    setErrorMsg(null);
    setLastFailedPrompt(null);
    setIsLoading(true);
    setTab('chat');

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantMsgId = `a-${Date.now()}`;
    let hasInsertedAssistantBubble = false;
    let accumulatedReply = '';

    const upsertAssistantContent = (content: string) => {
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!hasInsertedAssistantBubble) {
        hasInsertedAssistantBubble = true;
        setMessages((prev) => [
          ...prev,
          { id: assistantMsgId, role: 'assistant', content, timestampLabel: ts },
        ]);
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content } : m))
        );
      }
    };

    try {
      const apiMessages = nextMessages
        .filter((m) => !m.isGreeting && m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      const requestBody = JSON.stringify({
        messages: apiMessages,
        contextSummary: buildContextSummary(),
        language,
        knowledgeBase: buildKnowledgeContext(),
        userRole,
        emergencyMode,
        model: fastMode ? 'gemini-3.1-flash-lite' : aiModel,
      });

      const res = await fetch('/api/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: requestBody,
      });

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const rawText = await res.text();
        let errMessage = `Request failed with status ${res.status}`;
        try {
          const parsed = JSON.parse(rawText) as { error?: string };
          if (parsed.error) errMessage = parsed.error;
        } catch {
          // keep fallback
        }
        throw new Error(errMessage);
      }

      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const evt of events) {
            for (const rawLine of evt.split('\n')) {
              const line = rawLine.trim();
              if (!line.startsWith('data:')) continue;
              const jsonStr = line.slice(5).trim();
              if (!jsonStr) continue;
              let payload: { delta?: string; done?: boolean; error?: string } = {};
              try {
                payload = JSON.parse(jsonStr) as { delta?: string; done?: boolean; error?: string };
              } catch {
                continue;
              }
              if (payload.error) {
                throw new Error(payload.error);
              }
              if (payload.delta) {
                accumulatedReply += payload.delta;
                upsertAssistantContent(accumulatedReply);
              }
            }
          }
        }

        if (!accumulatedReply.trim()) {
          throw new Error('NEXORA AI Assistant returned an empty reply.');
        }
        upsertAssistantContent(accumulatedReply.trim());
      } else {
        const rawText = await res.text();
        let data: { reply?: string; error?: string } = {};
        try {
          data = JSON.parse(rawText) as { reply?: string; error?: string };
        } catch {
          throw new Error('Received an unexpected non-JSON response from NEXORA AI server.');
        }
        if (!data.reply || !data.reply.trim()) {
          throw new Error('NEXORA AI Assistant returned an empty reply.');
        }
        upsertAssistantContent(data.reply.trim());
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (!accumulatedReply.trim()) {
          setErrorMsg('Stopped writing answer.');
          setLastFailedPrompt(trimmed);
        }
        return;
      }
      if (!accumulatedReply.trim() && hasInsertedAssistantBubble) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
      }
      const message =
        err instanceof Error ? err.message : 'Unable to reach NEXORA AI Helper.';
      setErrorMsg(message);
      setLastFailedPrompt(trimmed);
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  };

  const handleStopGeneration = () => {
    abortRef.current?.abort();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        void sendPrompt(input);
      }
    }
  };

  const handleCopyReply = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === msg.id ? null : cur)), 1800);
    } catch {
      // Clipboard unavailable in restricted browser context
    }
  };

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbTopic.trim() || !kbGuidance.trim()) return;
    const entry: AiKnowledgeEntry = {
      id: `${isAdmin ? 'KB' : 'SOP'}-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      topic: kbTopic.trim(),
      category: kbCategory,
      guidance: kbGuidance.trim(),
      language: kbLang,
    };

    if (isAdmin && onSaveKnowledge) {
      await onSaveKnowledge(entry);
      setKbSavedNotice(`Saved "${entry.topic}" to global Firestore training corpus.`);
    } else {
      setLocalTrainingEntries((prev) => [entry, ...prev]);
      setKbSavedNotice(`Trained session chatbot with "${entry.topic}".`);
    }
    setKbTopic('');
    setKbGuidance('');
    window.setTimeout(() => setKbSavedNotice(null), 3500);
  };

  const handleRemoveTrainingEntry = async (id: string) => {
    if (id.startsWith('SOP-') || localTrainingEntries.some((item) => item.id === id)) {
      setLocalTrainingEntries((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    if (isAdmin && onDeleteKnowledge) {
      await onDeleteKnowledge(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Tabs + Multilingual Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              tab === 'chat' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Ask AI Chat
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
            <span>Safety Checklist</span>
          </button>
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
            <span>
              Teach AI / Rules ({localTrainingEntries.length + aiKnowledge.length})
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFastMode((v) => !v)}
            aria-pressed={fastMode}
            className={`min-h-[38px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
              fastMode
                ? 'border-sky-500/70 bg-sky-600/20 text-sky-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-500/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            <span>Fast Reply: {fastMode ? 'ON' : 'Standard'}</span>
          </button>

          <button
            type="button"
            onClick={() => setEmergencyMode((v) => !v)}
            aria-pressed={emergencyMode}
            className={`min-h-[38px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
              emergencyMode
                ? 'border-red-500 bg-red-600/25 text-red-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-red-500/50'
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
              className="min-h-[38px] px-2.5 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
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
          className={`flex flex-col h-[60vh] min-h-[390px] sm:h-[520px] border rounded-xl bg-slate-900 overflow-hidden ${
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
                  className="min-h-[34px] px-3 py-1 text-xs rounded-md border border-slate-700/80 bg-slate-900/70 text-slate-300 hover:text-white hover:border-blue-500/60 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {messages.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setMessages([INITIAL_ASSISTANT_MESSAGE]);
                  setErrorMsg(null);
                  setLastFailedPrompt(null);
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
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[82%] rounded-xl px-4 py-3 text-xs sm:text-sm ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900/95 border border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5 text-[10px] font-mono opacity-80">
                    <span className={m.role === 'user' ? 'text-blue-100' : 'text-blue-400'}>
                      {m.role === 'user' ? 'Operator' : 'NEXORA AI'}
                      {m.timestampLabel ? ` · ${m.timestampLabel}` : ''}
                    </span>
                    {m.role === 'assistant' && !m.isGreeting && (
                      <button
                        type="button"
                        onClick={() => void handleCopyReply(m)}
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-100 transition-colors"
                        aria-label="Copy assistant response"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" aria-hidden="true" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {m.role === 'assistant' ? (
                    <FormattedChatMessage content={m.content} />
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-xl px-4 py-2.5 text-xs font-mono bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  <span>Writing fast {language} reply...</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-200 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="leading-relaxed">{errorMsg}</span>
                {lastFailedPrompt && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void sendPrompt(lastFailedPrompt, true)}
                    className="min-h-[32px] px-3 py-1 rounded-md bg-red-600/80 hover:bg-red-600 text-white font-medium inline-flex items-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" aria-hidden="true" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-slate-800 bg-slate-950 flex items-end gap-2"
          >
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Ask anything in ${language} — general help, safety, coding, math, writing (Enter to send)...`}
              aria-label="Prompt NEXORA AI Assistant"
              className="flex-1 min-h-[44px] max-h-32 px-3.5 py-2.5 text-sm rounded-lg border border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                aria-label="Stop response generation"
                className="min-h-[44px] px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <StopCircle className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}
          </form>
        </div>
      )}

      {tab === 'checklists' && (
        <div className="border border-slate-800 rounded-xl bg-slate-900 divide-y divide-slate-800 overflow-hidden">
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

      {tab === 'knowledge' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddKnowledge}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  <span>Train NEXORA AI with Custom SOP / Playbook</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isAdmin
                    ? 'Entries added as Administrator are saved to Cloud Firestore for all operators.'
                    : 'Entries added here train NEXORA AI for your operator session alongside global playbooks.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {TRAINING_PRESETS.map((preset) => (
                  <button
                    key={preset.topic}
                    type="button"
                    onClick={() => {
                      setKbTopic(preset.topic);
                      setKbCategory(preset.category);
                      setKbGuidance(preset.guidance);
                    }}
                    className="px-2.5 py-1 rounded-md border border-slate-700/80 bg-slate-900/80 text-[11px] text-slate-300 hover:text-white hover:border-blue-500/60"
                  >
                    + {preset.topic.split(' ').slice(0, 2).join(' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                minLength={3}
                maxLength={160}
                value={kbTopic}
                onChange={(e) => setKbTopic(e.target.value)}
                placeholder="SOP or Knowledge Topic"
                className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
              />
              <select
                value={kbCategory}
                onChange={(e) => setKbCategory(e.target.value as AiKnowledgeEntry['category'])}
                className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
              >
                <option value="Disaster">Disaster</option>
                <option value="First Aid">First Aid</option>
                <option value="Cybersecurity">Cybersecurity</option>
                <option value="Checklist">Checklist</option>
              </select>
              <select
                value={kbLang}
                onChange={(e) => setKbLang(e.target.value)}
                className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
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
              maxLength={600}
              value={kbGuidance}
              onChange={(e) => setKbGuidance(e.target.value)}
              placeholder="Enter verified SOP, evacuation threshold, medical protocol, or cyber rule to train NEXORA AI..."
              className="w-full p-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {kbSavedNotice ? (
                <span className="text-xs text-emerald-400 font-medium">{kbSavedNotice}</span>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Active training corpus: {localTrainingEntries.length + aiKnowledge.length} SOPs
                </span>
              )}
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isAdmin ? 'Train & Save Globally' : 'Train Chatbot'}</span>
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              value={kbSearch}
              onChange={(e) => setKbSearch(e.target.value)}
              placeholder="Filter trained SOPs by keyword, category, or language..."
              aria-label="Filter AI training knowledge base"
              className="w-full min-h-[38px] px-3 text-xs rounded-lg border border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
            {combinedKnowledge.map((k) => {
              const isLocal = localTrainingEntries.some((item) => item.id === k.id);
              return (
                <div key={k.id} className="p-4 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-slate-400 font-mono text-[11px]">
                      <span>{k.id}</span>
                      <span>·</span>
                      <span className="text-blue-400">{k.category}</span>
                      <span>·</span>
                      <span>{k.language}</span>
                      {isLocal && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 text-[10px]">
                          Custom Trained
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-100">{k.topic}</div>
                    <p className="text-slate-400 leading-relaxed">{k.guidance}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('chat');
                        void sendPrompt(`Apply the "${k.topic}" SOP to our current operational status.`);
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-blue-500/60 text-[11px]"
                    >
                      Ask AI
                    </button>
                    {(isLocal || (isAdmin && onDeleteKnowledge)) && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveTrainingEntry(k.id)}
                        aria-label={`Delete ${k.topic}`}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/40 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
