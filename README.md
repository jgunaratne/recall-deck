# HECKLE

A pop-quiz game show that ambushes you about the thing Claude just taught you.

## Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your Anthropic API key
npm run dev
```

## Environment Variables

- `ANTHROPIC_API_KEY` — Required. Your Anthropic API key (chat, quiz generation, and quiz reactions).
- `GEMINI_API_KEY` — Optional. Enables the Gemini chat provider and the Gemini Live voice tutor.
- `DEFAULT_AI_PROVIDER` — Optional. `anthropic` (default) or `gemini`.
- `DEMO_PASSCODE` — Optional. Set to gate access with a passcode.

## Deployed URL

<!-- Add your Vercel URL here after deployment -->
