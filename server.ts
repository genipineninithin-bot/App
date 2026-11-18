import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantRequestBody {
  messages?: AssistantMessage[];
  contextSummary?: string;
  language?: string;
  knowledgeBase?: string;
  model?: string;
}

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
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
  return /503|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|429|overloaded/i.test(msg);
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
  const statusCode = isTransientCapacityError(raw) ? 503 : 500;
  return { statusCode, message: cleanMessage || fallbackMsg };
}

async function generateWithFallback(
  ai: GoogleGenAI,
  requestedModel: string | undefined,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const primaryModel = resolveGeminiModel(requestedModel);
  try {
    return await ai.models.generateContent({ model: primaryModel, ...params });
  } catch (err) {
    if (primaryModel !== 'gemini-3.1-flash-lite' && isTransientCapacityError(err)) {
      return await ai.models.generateContent({ model: 'gemini-3.1-flash-lite', ...params });
    }
    throw err;
  }
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
      factors.push(`Rainfall rate ${rainfall} mm/h (+${rainContrib} risk pts)`);
      factors.push(`Atmospheric saturation ${humidity}% (+${humContrib} risk pts)`);
    } else if (disasterType === 'Cyclone') {
      const windContrib = Math.min(55, Math.round(wind * 0.35));
      const rainContrib = Math.min(25, Math.round(rainfall * 0.3));
      score += windContrib + rainContrib;
      factors.push(`Sustained wind speed ${wind} km/h (+${windContrib} risk pts)`);
      factors.push(`Cyclonic precipitation ${rainfall} mm/h (+${rainContrib} risk pts)`);
    } else if (disasterType === 'Wildfire') {
      const heatContrib = Math.max(0, Math.min(35, Math.round((temperature - 22) * 1.7)));
      const dryContrib = Math.max(0, Math.min(30, Math.round((65 - humidity) * 0.6)));
      const windContrib = Math.min(25, Math.round(wind * 0.28));
      score += heatContrib + dryContrib + windContrib;
      factors.push(`Ambient temperature ${temperature}°C (+${heatContrib} risk pts)`);
      factors.push(`Low relative humidity ${humidity}% (+${dryContrib} risk pts)`);
      factors.push(`Wind spread factor ${wind} km/h (+${windContrib} risk pts)`);
    } else if (disasterType === 'Grid Stress') {
      const thermalContrib = Math.abs(temperature - 22) > 12 ? 28 : 10;
      const windContrib = Math.min(35, Math.round(wind * 0.32));
      score += thermalContrib + windContrib;
      factors.push(`Thermal load variance at ${temperature}°C (+${thermalContrib} risk pts)`);
      factors.push(`Line icing/gust exposure ${wind} km/h (+${windContrib} risk pts)`);
    } else {
      const precipSecondary = Math.min(20, Math.round(rainfall * 0.25));
      score += 32 + precipSecondary;
      factors.push('Seismic baseline & secondary landslide rain coupling assessed');
    }

    const riskScore = Math.min(98, Math.max(8, Math.round(score)));
    const riskLevel: 'Low' | 'Medium' | 'High' =
      riskScore >= 70 ? 'High' : riskScore >= 42 ? 'Medium' : 'Low';
    const confidencePct = Math.min(94, Math.max(72, Math.round(78 + (factors.length * 4))));

    const precautions =
      riskLevel === 'High'
        ? [
            `Alert regional response desks in ${location} for immediate standby.`,
            disasterType === 'Flood'
              ? 'Avoid low-lying underpasses and shut off main electrical breakers if water rises.'
              : disasterType === 'Cyclone'
              ? 'Secure exterior structures, charge backup radios, and follow inland evacuation corridors.'
              : 'Stage suppression/evacuation assets and protect high-voltage substation corridors.',
          ]
        : riskLevel === 'Medium'
        ? [
            `Maintain 6-hour telemetry monitoring across ${location}.`,
            'Verify emergency go-kits, potable water reserves, and shelter availability.',
          ]
        : [
            `Routine baseline telemetry active for ${location}; no immediate evacuation trigger.`,
          ];

    res.json({
      disasterType,
      location,
      riskLevel,
      riskScore,
      confidencePct,
      modelLabel: 'Demonstration Environmental Risk Model (Multi-Factor Weighted Heuristic)',
      factors,
      explanation: `${disasterType} assessment for ${location} computed ${riskLevel} Risk (${riskScore}/100) from supplied meteorological telemetry.`,
      precautions,
    });
  });

  app.post('/api/assistant', async (req, res) => {
    try {
      const body = (req.body || {}) as AssistantRequestBody & { emergencyMode?: boolean };
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const contextSummary =
        typeof body.contextSummary === 'string' ? body.contextSummary : '';
      const language =
        typeof body.language === 'string' && body.language.trim()
          ? body.language.trim()
          : 'English';
      const knowledgeBase =
        typeof body.knowledgeBase === 'string' ? body.knowledgeBase : '';
      const emergencyMode = Boolean(body.emergencyMode);

      if (messages.length === 0) {
        res.status(400).json({ error: 'Please provide a question or command for Nexora AI Assistant.' });
        return;
      }

      const ai = getGeminiClient();
      const conversationTranscript = messages
        .slice(-10)
        .map((m) => {
          const text = typeof m.content === 'string' ? m.content : String((m as { text?: string }).text || '');
          return `${m.role === 'user' ? 'Operator' : 'Nexora AI'}: ${text}`;
        })
        .join('\n\n');

      const promptParts = [
        contextSummary ? `Live Operational Telemetry Snapshot:\n${contextSummary}` : '',
        knowledgeBase ? `Verified Knowledge Base:\n${knowledgeBase}` : '',
        `Conversation:\n${conversationTranscript}`,
      ].filter(Boolean);

      const emergencyDirective = emergencyMode
        ? 'EMERGENCY MODE ACTIVE: Respond with ultra-concise numbered life-safety action steps only (under 120 words). Instruct the user to call local emergency services (112/911) for immediate danger.'
        : 'Keep responses structured and practical (under 220 words unless asked for full detail).';

      const response = await generateWithFallback(ai, body.model, {
        contents: promptParts.join('\n\n'),
        config: {
          systemInstruction: `You are Nexora AI Assistant, an emergency preparedness, first-aid, disaster intelligence, and cybersecurity awareness analyst. Respond strictly in ${language}. ${emergencyDirective} Never invent official government emergency alerts, medical diagnoses, or claim live local EMS dispatch availability.`,
        },
      });

      const reply = response.text?.trim();
      if (!reply) {
        res.status(502).json({ error: 'Nexora AI Assistant returned an empty response.' });
        return;
      }

      res.json({ reply });
    } catch (err: unknown) {
      const { statusCode, message } = formatGeminiError(err, 'Failed to reach Nexora AI Assistant service.');
      res.status(statusCode).json({ error: message });
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
            'You are a cybersecurity threat analyst. Passively evaluate the submitted URL string, email/SMS message, or CSV/network log for phishing, credential harvesting, malicious redirects, or intrusion anomalies.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, description: 'Safe, Suspicious, or Malicious' },
              riskScore: { type: Type.INTEGER, description: 'Score from 0 to 100' },
              phishingProbability: { type: Type.INTEGER, description: 'Phishing likelihood 0 to 100' },
              severity: { type: Type.STRING, description: 'Low, Moderate, High, or Critical' },
              indicators: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 concise technical or social-engineering indicators',
              },
              suspiciousKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Suspicious tokens, urgencies, or IOC strings observed',
              },
              recommendation: { type: Type.STRING, description: 'Actionable defensive step' },
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
    console.log(`Nexora ai server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
