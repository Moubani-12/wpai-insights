require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['POST', 'GET'],
}));
app.use(express.json({ limit: '2mb' }));

// Serve static frontend files (index.html, app.js, etc.)
app.use(express.static(__dirname));

// ─── AI Analysis Endpoint ──────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { sampleMessages, participants, messageCount, wordCount } = req.body;

    if (!sampleMessages || !Array.isArray(sampleMessages)) {
      return res.status(400).json({ error: 'sampleMessages array is required' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY is not configured on the server.',
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const participantList = (participants || []).join(', ');
    const sampleText = sampleMessages.slice(0, 300).join('\n');

    const systemPrompt = `You are an expert chat analyst. Analyze the provided WhatsApp chat messages and return a single valid JSON object — no markdown, no explanation, just raw JSON.`;

    const userPrompt = `Analyze this WhatsApp chat excerpt.

METADATA:
- Total participants: ${participantList || 'Unknown'}
- Total messages in full chat: ${messageCount || sampleMessages.length}
- Total words in full chat: ${wordCount || 'Unknown'}

SAMPLE MESSAGES (up to 300):
${sampleText}

Return ONLY this exact JSON structure (no markdown fences, no comments):
{
  "toxicity": {
    "score": <integer 0-10, where 0=completely safe, 10=extremely toxic>,
    "level": <"safe" | "mild" | "moderate" | "high" | "severe">,
    "flaggedPatterns": [<list of up to 5 concerning patterns/phrases as strings>],
    "explanation": <1-2 sentence explanation of the toxicity assessment>
  },
  "languages": [
    { "language": <language name>, "percentage": <integer 0-100> }
  ],
  "summary": <2-3 sentence narrative summary of what this conversation is about>,
  "topics": [<list of 3-7 main topics as short strings>],
  "relationshipScore": {
    "score": <integer 0-100>,
    "label": <"Distant" | "Acquaintances" | "Friendly" | "Close Friends" | "Best Friends" | "Intimate">,
    "explanation": <2-3 sentence friendly explanation of the score and what it reflects about the relationship>,
    "factors": [<list of 2-4 positive factors observed>]
  }
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const rawText = message.content[0]?.text || '{}';

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({
        error: 'AI returned malformed JSON',
        raw: rawText.substring(0, 500),
      });
    }

    res.json(parsed);
  } catch (err) {
    console.error('AI analysis error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasKey: !!process.env.ANTHROPIC_API_KEY });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 WpAI Insights server running at http://localhost:${PORT}`);
  console.log(`   API key configured: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`   Open http://localhost:${PORT} in your browser\n`);
});
