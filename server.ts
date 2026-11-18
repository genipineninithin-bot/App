import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  text?: string;
}

interface AssistantRequestBody {
  messages?: AssistantMessage[];
  contextSummary?: string;
  language?: string;
  knowledgeBase?: string;
  userRole?: 'citizen' | 'rescue' | 'administrator';
  emergencyMode?: boolean;
  model?: string;
}

const NEXORA_TRAINING_PLAYBOOK = `
NEXORA AI PLATFORM TRAINING & OPERATIONAL KNOWLEDGE:
- Platform Identity: NEXORA AI ("Predict. Protect. Respond. Empower.") — an integrated AI disaster prediction, emergency response, 3D geospatial mapping, and cybersecurity intelligence platform.
- Module Directory (guide users to exact module when helpful):
  * Module 01 (Command Center & 3D Globe): Live disaster/cyber overview, 3D tactical globe showing disaster risk zones, alerts, and incident pins.
  * Module 02 (Disaster Prediction & Monitoring): Environmental risk scoring (Flood, Cyclone, Wildfire, Seismic, Grid Stress) + live USGS M4.5+ seismic feed sync.
  * Module 03 (Cybersecurity & Threat Detection): Passive phishing URL/SMS/log analyzer, MITRE ATT&CK telemetry, containment queue.
  * Module 04 (NEXORA AI Assistant): Multilingual preparedness, first-aid, triage, cyber defense, safety checklists, and custom SOP training knowledge base.
  * Module 05 (Emergency Response & Incident Ops): Citizen SOS reporting, pre/post imagery damage assessment, START patient triage, and rescue unit dispatch.
  * Module 06 (Rescue & Relief Management): Hospitals, open ICU/trauma beds, evacuation shelters, potable water/supply packs, and ambulance fleets.
  * Module 07 (Data Analytics & Intelligence): 24h incident & cyber mitigation trends and exportable intelligence briefs.
  * Module 08 (Secure Alert & Notification System): Official verified hazard/cyber alerts and SMS/Email notification preferences.
  * Module 09 (Admin & System Management): RBAC user governance, AI model config, and immutable audit logs.
- Core Domain Protocols:
  * Flood: Never walk/drive in floodwaters; 15cm sweeps adults, 30cm floats cars. Move to higher floors/elevation, shut off main power breakers if water enters premises, avoid downed lines.
  * Seismic & Tsunami: Drop, Cover, Hold On. After shaking stops, evacuate coastal zones >=30m elevation or >=2km inland without waiting for sirens; check gas odors before shutting valves.
  * Cyclone: Evacuate storm-surge zones early, shelter in interior windowless rooms, avoid venturing out during the calm eye.
  * Wildfire: Follow evacuation orders immediately, seal vents, use N95/P100 masks for smoke, keep access roads clear for fire units.
  * First Aid & START Triage: Severe bleeding -> firm direct pressure + tourniquet 5cm above limb hemorrhage (record time). Burns -> 20min cool running water (no ice). START triage -> Green (ambulatory), Red-Immediate (RR>30, cap refill>2s, no radial pulse, unable to follow commands), Yellow-Delayed, Black-Expectant. Always advise dialing 112/911 for life-threatening emergencies; clarify this is guidance, not a medical diagnosis.
  * Cybersecurity: Never tap unknown APK/relief links in SMS/WhatsApp; verify exact domain spelling and HTTPS; isolate compromised OT/SCADA or CAD endpoints onto clean VLANs; scan suspect links in Module 03.
`.trim();

const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
const ALLOWED_GEMINI_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

function resolveGeminiModel(requested?: string): string {
  if (typeof requested === 'string' && ALLOWED_GEMINI_MODELS.has(requested.trim())) {
    return requested.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

function parseFiniteNum(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function getGeminiClient(): GoogleGenAI {
  const rawKey = process.env.GEMINI_API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
  if (!apiKey || /^MY_GEMINI/i.test(apiKey)) {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Please add a valid key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientCapacityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /503|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|429|overloaded|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg);
}

function isAuthOrKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /GEMINI_API_KEY|API key not valid|API_KEY_INVALID|API_KEY_EXPIRED|PERMISSION_DENIED|UNAUTHENTICATED|API key expired/i.test(msg);
}

function formatGeminiError(err: unknown, fallbackMsg: string): { statusCode: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || fallbackMsg);
  if (raw.includes('GEMINI_API_KEY')) {
    return { statusCode: 503, message: raw };
  }
  let cleanMessage = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number; status?: string } };
    if (parsed?.error?.message) {
      cleanMessage = parsed.error.message;
    }
  } catch {
    // keep raw message
  }
  if (/API key not valid|API_KEY_INVALID|API_KEY_EXPIRED|PERMISSION_DENIED|UNAUTHENTICATED|API key expired/i.test(cleanMessage)) {
    return {
      statusCode: 400,
      message:
        'Gemini API key is invalid or expired. Please generate a new key in Google AI Studio and update GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  const statusCode = isTransientCapacityError(raw) ? 503 : 500;
  return { statusCode, message: cleanMessage || fallbackMsg };
}

function applyFastModelConfig<
  T extends Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
>(model: string, params: T): T {
  const baseConfig = { ...(params.config || {}) };
  if (model === 'gemini-4-hydrogen' && !baseConfig.thinkingConfig) {
    baseConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }
  return { ...params, config: baseConfig };
}

async function generateWithFallback(
  ai: GoogleGenAI,
  requestedModel: string | undefined,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const primaryModel = resolveGeminiModel(requestedModel);
  try {
    return await ai.models.generateContent({
      model: primaryModel,
      ...applyFastModelConfig(primaryModel, params),
    });
  } catch (err) {
    if (primaryModel !== 'gemini-3.1-flash-lite' && !isAuthOrKeyError(err)) {
      await new Promise((r) => setTimeout(r, 200));
      return await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        ...applyFastModelConfig('gemini-3.1-flash-lite', params),
      });
    }
    throw err;
  }
}

async function generateStreamWithFallback(
  ai: GoogleGenAI,
  requestedModel: string | undefined,
  params: Omit<Parameters<GoogleGenAI['models']['generateContentStream']>[0], 'model'>
) {
  const primaryModel = resolveGeminiModel(requestedModel);
  try {
    return await ai.models.generateContentStream({
      model: primaryModel,
      ...applyFastModelConfig(primaryModel, params),
    });
  } catch (err) {
    if (primaryModel !== 'gemini-3.1-flash-lite' && !isAuthOrKeyError(err)) {
      await new Promise((r) => setTimeout(r, 200));
      return await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        ...applyFastModelConfig('gemini-3.1-flash-lite', params),
      });
    }
    throw err;
  }
}

function buildAssistantRequestPayload(body: AssistantRequestBody) {
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const contextSummary =
    typeof body.contextSummary === 'string' ? body.contextSummary.trim().slice(0, 3500) : '';
  const language =
    typeof body.language === 'string' && body.language.trim()
      ? body.language.trim().slice(0, 40)
      : 'English';
  const knowledgeBase =
    typeof body.knowledgeBase === 'string' ? body.knowledgeBase.trim().slice(0, 3500) : '';
  const userRole =
    body.userRole === 'administrator' || body.userRole === 'rescue'
      ? body.userRole
      : 'citizen';
  const emergencyMode = Boolean(body.emergencyMode);

  const normalizedTurns: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const m of rawMessages.slice(-10)) {
    const rawText = typeof m.content === 'string' ? m.content : String(m.text || '');
    const text = rawText.trim();
    if (!text) continue;
    const geminiRole: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    if (normalizedTurns.length === 0 && geminiRole === 'model') continue;
    const prev = normalizedTurns[normalizedTurns.length - 1];
    if (prev && prev.role === geminiRole) {
      prev.text = `${prev.text}\n\n${text}`;
    } else {
      normalizedTurns.push({ role: geminiRole, text });
    }
  }

  const roleDirective =
    userRole === 'administrator'
      ? 'Operator Role: ADMINISTRATOR — reply clearly, directly, and helpfully.'
      : userRole === 'rescue'
      ? 'Operator Role: RESCUE TEAM — reply clearly, practically, and fast.'
      : 'Operator Role: USER — reply in simple, friendly everyday words anyone can understand.';

  const emergencyDirective = emergencyMode
    ? 'EMERGENCY MODE ACTIVE: Keep emergency answers short and numbered (under 120 words). Tell the user to call local emergency services (112/911) right away if anyone is in danger.'
    : 'Keep answers clear, direct, and easy to read. Use short paragraphs or bullet steps.';

  const systemParts = [
    `You are NEXORA AI Helper — a fast, friendly, all-purpose AI assistant inside NEXORA AI.`,
    `IMPORTANT: Answer ALL kinds of questions the user asks — including general knowledge, math, science, coding, writing, translations, daily help, study questions, weather, health/first-aid, cybersecurity/scam checks, and disaster/emergency guidance. Never refuse a normal question just because it is not about disasters.`,
    `Write in ${language} unless the user asks you to translate or reply in a different language.`,
    roleDirective,
    emergencyDirective,
    `For live medical emergencies advise dialing 112/911 (note guidance is not a medical diagnosis). Never invent fake official government alerts.`,
    `Only bring up NEXORA live alerts/incidents/cyber stats when the user asks about them or when relevant to safety.`,
    NEXORA_TRAINING_PLAYBOOK,
    knowledgeBase ? `Custom Safety Rules / Training:\n${knowledgeBase}` : '',
    contextSummary ? `Live Platform Context:\n${contextSummary}` : '',
  ].filter(Boolean);

  const contents = normalizedTurns.map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));

  return {
    normalizedTurns,
    contents,
    systemInstruction: systemParts.join('\n\n'),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nexora-ai-server' });
  });

  app.post('/api/disaster/predict', (req, res) => {
    const body = (req.body || {}) as {
      disasterType?: string;
      location?: string;
      rainfallMm?: number;
      temperatureC?: number;
      humidityPct?: number;
      windKmh?: number;
    };

    const disasterType = String(body.disasterType || 'Flood').trim();
    const location = String(body.location || 'Regional Sector').trim();
    const rainfall = Math.max(0, parseFiniteNum(body.rainfallMm, 0));
    const temperature = parseFiniteNum(body.temperatureC, 26);
    const humidity = Math.min(100, Math.max(0, parseFiniteNum(body.humidityPct, 55)));
    const wind = Math.max(0, parseFiniteNum(body.windKmh, 15));

    let score = 15;
    const factors: string[] = [];

    if (disasterType === 'Flood') {
      const rainContrib = Math.min(50, Math.round(rainfall * 0.72));
      const humContrib = humidity > 75 ? Math.round((humidity - 70) * 0.6) : 5;
      score += rainContrib + humContrib;
      factors.push(`Heavy rain: ${rainfall} mm/h (+${rainContrib} risk points)`);
      factors.push(`Moisture in air: ${humidity}% (+${humContrib} risk points)`);
    } else if (disasterType === 'Cyclone') {
      const windContrib = Math.min(55, Math.round(wind * 0.35));
      const rainContrib = Math.min(25, Math.round(rainfall * 0.3));
      score += windContrib + rainContrib;
      factors.push(`Strong winds: ${wind} km/h (+${windContrib} risk points)`);
      factors.push(`Storm rain: ${rainfall} mm/h (+${rainContrib} risk points)`);
    } else if (disasterType === 'Wildfire') {
      const heatContrib = Math.max(0, Math.min(35, Math.round((temperature - 22) * 1.7)));
      const dryContrib = Math.max(0, Math.min(30, Math.round((65 - humidity) * 0.6)));
      const windContrib = Math.min(25, Math.round(wind * 0.28));
      score += heatContrib + dryContrib + windContrib;
      factors.push(`Hot weather: ${temperature}°C (+${heatContrib} risk points)`);
      factors.push(`Dry air: ${humidity}% humidity (+${dryContrib} risk points)`);
      factors.push(`Wind pushing fire: ${wind} km/h (+${windContrib} risk points)`);
    } else if (disasterType === 'Grid Stress') {
      const thermalContrib = Math.abs(temperature - 22) > 12 ? 28 : 10;
      const windContrib = Math.min(35, Math.round(wind * 0.32));
      score += thermalContrib + windContrib;
      factors.push(`Temperature strain at ${temperature}°C (+${thermalContrib} risk points)`);
      factors.push(`Wind on power lines: ${wind} km/h (+${windContrib} risk points)`);
    } else {
      const precipSecondary = Math.min(20, Math.round(rainfall * 0.25));
      score += 32 + precipSecondary;
      factors.push('Earthquake shaking and rain-soaked ground landslide check');
    }

    const riskScore = Math.min(98, Math.max(8, Math.round(score)));
    const riskLevel: 'Low' | 'Medium' | 'High' =
      riskScore >= 70 ? 'High' : riskScore >= 42 ? 'Medium' : 'Low';
    const confidencePct = Math.min(94, Math.max(72, Math.round(78 + (factors.length * 4))));

    const precautions =
      riskLevel === 'High'
        ? [
            `Alert local emergency teams in ${location} to get ready right away.`,
            disasterType === 'Flood'
              ? 'Stay out of flooded roads and underpasses, and turn off main power if water enters your home.'
              : disasterType === 'Cyclone'
              ? 'Tie down loose outdoor items, charge your phones, and be ready to move to a shelter.'
              : 'Keep roads clear for fire and power crews and prepare to leave if told to evacuate.',
          ]
        : riskLevel === 'Medium'
        ? [
            `Keep checking weather updates in ${location} over the next 6 hours.`,
            'Make sure your flashlight, clean drinking water, and nearest shelter address are ready.',
          ]
        : [
            `Conditions look calm in ${location} right now. No emergency move is needed.`,
          ];

    res.json({
      disasterType,
      location,
      riskLevel,
      riskScore,
      confidencePct,
      modelLabel: 'Simple Weather Risk Guide (Sample Model)',
      factors,
      explanation: `${disasterType} check for ${location}: ${riskLevel} Risk (${riskScore} out of 100) based on the weather numbers entered.`,
      precautions,
    });
  });

  app.post('/api/assistant', async (req, res) => {
    try {
      const body = (req.body || {}) as AssistantRequestBody;
      const { normalizedTurns, contents, systemInstruction } = buildAssistantRequestPayload(body);

      if (normalizedTurns.length === 0) {
        res.status(400).json({ error: 'Please provide a question or message for NEXORA AI Helper.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await generateWithFallback(ai, body.model, {
        contents,
        config: { systemInstruction },
      });

      const reply = response.text?.trim();
      if (!reply) {
        res.status(502).json({ error: 'NEXORA AI Assistant returned an empty response.' });
        return;
      }

      res.json({ reply });
    } catch (err: unknown) {
      const { statusCode, message } = formatGeminiError(err, 'Failed to reach NEXORA AI Assistant service.');
      res.status(statusCode).json({ error: message });
    }
  });

  app.post('/api/assistant/stream', async (req, res) => {
    let streamStarted = false;
    try {
      const body = (req.body || {}) as AssistantRequestBody;
      const { normalizedTurns, contents, systemInstruction } = buildAssistantRequestPayload(body);

      if (normalizedTurns.length === 0) {
        res.status(400).json({ error: 'Please provide a question or message for NEXORA AI Helper.' });
        return;
      }

      const ai = getGeminiClient();
      const stream = await generateStreamWithFallback(ai, body.model, {
        contents,
        config: { systemInstruction },
      });

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      streamStarted = true;

      let totalChars = 0;
      for await (const chunk of stream) {
        const delta = chunk.text ?? '';
        if (delta) {
          totalChars += delta.length;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      }

      if (totalChars === 0) {
        res.write(
          `data: ${JSON.stringify({ error: 'NEXORA AI Assistant returned an empty response.' })}\n\n`
        );
      } else {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }
      res.end();
    } catch (err: unknown) {
      const { statusCode, message } = formatGeminiError(err, 'Failed to reach NEXORA AI Assistant service.');
      if (!streamStarted) {
        res.status(statusCode).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/cyber/analyze', async (req, res) => {
    try {
      const { kind, payload } = (req.body || {}) as {
        kind?: 'url' | 'message' | 'log';
        payload?: string;
      };
      if (!payload || typeof payload !== 'string' || !payload.trim()) {
        res.status(400).json({ error: 'Provide a URL, message, or network log snippet to analyze.' });
        return;
      }

      let urlBreakdown: Record<string, string | boolean | number> | undefined;
      if (kind === 'url') {
        const cleanRaw = payload
          .trim()
          .replace(/\[\.\]/g, '.')
          .replace(/^hxxps?:\/\//i, (m) => m.toLowerCase().replace('hxxp', 'http'));
        try {
          const parsed = new URL(/^https?:\/\//i.test(cleanRaw) ? cleanRaw : `https://${cleanRaw}`);
          urlBreakdown = {
            protocol: parsed.protocol.replace(':', ''),
            host: parsed.hostname,
            isHttps: parsed.protocol === 'https:',
            hasIpHost: /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname),
            subdomainCount: Math.max(0, parsed.hostname.split('.').length - 2),
            queryParams: Array.from(parsed.searchParams.keys()).length,
          };
        } catch {
          urlBreakdown = { malformedUrl: true, rawLength: payload.trim().length };
        }
      }

      const ai = getGeminiClient();
      const response = await generateWithFallback(ai, DEFAULT_GEMINI_MODEL, {
        contents: `Passively analyze this ${kind || 'url'} artifact for cybersecurity risk (do NOT fetch external links):\n\n${payload.slice(0, 4000)}`,
        config: {
          systemInstruction:
            'You are an online safety helper. Check the submitted website link, SMS/email text, or log for scams, fake login pages, or harmful activity. Write indicators and recommendations in simple, clear everyday English that anyone can understand.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, description: 'Safe, Suspicious, or Malicious' },
              riskScore: { type: Type.INTEGER, description: 'Score from 0 to 100' },
              phishingProbability: { type: Type.INTEGER, description: 'Scam likelihood 0 to 100' },
              severity: { type: Type.STRING, description: 'Low, Moderate, High, or Critical' },
              indicators: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 short, plain-English clues explaining why it looks safe or risky',
              },
              suspiciousKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Suspicious words or warning signs found',
              },
              recommendation: { type: Type.STRING, description: 'Simple, clear advice on what the person should do next' },
            },
          },
        },
      });

      const raw = (response.text ?? '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      let parsedJson: Record<string, unknown>;
      try {
        parsedJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        res.status(502).json({ error: 'Cyber threat model returned malformed JSON output.' });
        return;
      }
      res.json({ ...parsedJson, urlBreakdown });
    } catch (err: unknown) {
      const { statusCode, message } = formatGeminiError(err, 'Cyber analysis failed.');
      res.status(statusCode).json({ error: message });
    }
  });

  app.post('/api/response/analyze', async (req, res) => {
    try {
      const {
        mode,
        title,
        region,
        notes,
        imageBase64,
        mimeType,
        preImageBase64,
        preMimeType,
        damageCategory,
        estimatedAreaKm2,
        patientFlags,
      } = (req.body || {}) as {
        mode?: 'damage' | 'triage' | 'rescue_recommend';
        title?: string;
        region?: string;
        notes?: string;
        imageBase64?: string;
        mimeType?: string;
        preImageBase64?: string;
        preMimeType?: string;
        damageCategory?: string;
        estimatedAreaKm2?: string;
        patientFlags?: {
          conscious?: string;
          breathing?: string;
          bleeding?: string;
          symptoms?: string;
        };
      };

      const ai = getGeminiClient();
      const textPrompt =
        mode === 'triage'
          ? `Provide AI-assisted patient triage decision support (not a medical diagnosis) for: Title="${title || ''}", Region="${region || ''}", Conscious="${patientFlags?.conscious || 'Unknown'}", Breathing="${patientFlags?.breathing || 'Unknown'}", Visible Bleeding="${patientFlags?.bleeding || 'Unknown'}", Symptoms="${patientFlags?.symptoms || notes || ''}".`
          : mode === 'rescue_recommend'
          ? `Recommend optimal rescue team specialization, vehicle/equipment type, and dispatch priority for: Title="${title || ''}", Region="${region || ''}", Notes="${notes || ''}".`
          : `Perform pre-vs-post disaster imagery & damage assessment for: Title="${title || ''}", Region="${region || ''}", Operator Damage Category="${damageCategory || 'Unspecified'}", Estimated Area="${estimatedAreaKm2 || 'Assessing'} km²", Notes="${notes || ''}". Highlight possible structural/flood changes. Explicitly note that imagery alone cannot determine confirmed casualties or trapped persons.`;

      const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
      if (preImageBase64 && preMimeType) {
        parts.push({ inlineData: { mimeType: preMimeType, data: preImageBase64 } });
      }
      if (imageBase64 && mimeType) {
        parts.push({ inlineData: { mimeType, data: imageBase64 } });
      }
      parts.push({ text: textPrompt });

      const contents = parts.length > 1 ? { parts } : textPrompt;

      const response = await generateWithFallback(ai, DEFAULT_GEMINI_MODEL, {
        contents,
        config: {
          systemInstruction:
            'You are an emergency operations AI advisor. Provide structured, concise operational assessments (under 150 words) with clear risk/damage classification and next step. Never claim satellite imagery confirms casualties, and clarify that patient triage is decision support for qualified medical responders.',
        },
      });

      res.json({ analysis: response.text?.trim() || 'Assessment completed.' });
    } catch (err: unknown) {
      const { statusCode, message } = formatGeminiError(err, 'Response AI analysis failed.');
      res.status(statusCode).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXORA AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
