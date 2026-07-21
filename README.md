# Recall Tutor

A pop-quiz game show that ambushes you about the thing your AI tutor just taught you.

## Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with at least one provider API key
npm run dev
```

## Environment Variables

- `ANTHROPIC_API_KEY` — Optional. Enables the Claude chat, quiz generation, and quiz reaction provider.
- `GEMINI_API_KEY` — Optional. Enables the Gemini chat provider and Gemini Live voice tutor.
- `OPENAI_API_KEY` — Optional. Enables the OpenAI chat/quiz provider and OpenAI Realtime voice tutor.
- `DEFAULT_AI_PROVIDER` — Optional. `anthropic`, `gemini`, or `openai` (default).
- `OPENAI_TEXT_MODEL` — Optional. Defaults OpenAI text calls to `gpt-5.6-terra`.
- `OPENAI_CHAT_MODEL` — Optional. Overrides the OpenAI model for tutor chat.
- `OPENAI_QUIZ_MODEL` — Optional. Overrides the OpenAI model for structured quiz generation.
- `OPENAI_REACTION_MODEL` — Optional. Overrides the OpenAI model for quiz reactions; defaults to `gpt-5.6-luna`.
- `OPENAI_REALTIME_MODEL` — Optional. Overrides the OpenAI Realtime voice model; defaults to `gpt-realtime-2.1-mini`.
- `OPENAI_REALTIME_VOICE` — Optional. Overrides the OpenAI Realtime voice; defaults to `marin`.
- `DEMO_PASSCODE` — Optional. Set to gate access with a passcode.

## Deployed URL

<!-- Add your Vercel URL here after deployment -->
