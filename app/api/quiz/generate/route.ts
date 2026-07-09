import { getAnthropicClient, MODELS } from '@/lib/anthropic';
import { getGeminiClient, GEMINI_MODELS } from '@/lib/gemini';
import { getQuizGenerationSystemPrompt, getQuizGenerationUserPrompt } from '@/lib/prompts';
import { QuizQuestionSchema, validateQuizQuestion, QUIZ_QUESTION_JSON_SCHEMA } from '@/lib/schema';
import { shuffleArray } from '@/lib/shuffle';
import { resolveProvider } from '@/lib/provider';
import { Type } from '@google/genai';

export const runtime = 'nodejs';

const GEMINI_QUIZ_QUESTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    concept_tested: {
      type: Type.STRING,
      description: 'The single claim from the explanation this question tests',
    },
    misconception: {
      type: Type.STRING,
      description: 'The specific plausible misconception this question targets',
    },
    question: {
      type: Type.STRING,
      description: 'Max 25 words. Tests understanding, not verbatim recall of phrasing.',
    },
    host_intro: {
      type: Type.STRING,
      description: 'One-line Monty setup for this question, max 15 words',
    },
    difficulty: {
      type: Type.STRING,
      enum: ['warmup', 'solid', 'spicy'],
    },
    answers: {
      type: Type.ARRAY,
      description: 'Exactly 4 items. Exactly one has is_correct=true.',
      items: {
        type: Type.OBJECT,
        properties: {
          text: {
            type: Type.STRING,
            description: 'Max 8 words',
          },
          is_correct: {
            type: Type.BOOLEAN,
          },
          why_tempting: {
            type: Type.STRING,
            description: 'Why a learner would pick this. For the correct answer: why it is right.',
          },
        },
        required: ['text', 'is_correct', 'why_tempting'],
      },
    },
  },
  required: ['concept_tested', 'misconception', 'question', 'host_intro', 'difficulty', 'answers'],
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transcript, difficulty = 'solid' } = body;
    const provider = resolveProvider(body);

    if (!transcript || typeof transcript !== 'string') {
      return new Response(JSON.stringify({ error: 'Transcript is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate difficulty
    const validDifficulties = ['warmup', 'solid', 'spicy'] as const;
    if (!validDifficulties.includes(difficulty)) {
      return new Response(JSON.stringify({ error: 'Invalid difficulty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let parsed: unknown;

    if (provider === 'gemini') {
      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: GEMINI_MODELS.QUIZ_GENERATE,
        contents: [
          {
            role: 'user',
            parts: [{ text: getQuizGenerationUserPrompt(transcript) }],
          },
        ],
        config: {
          systemInstruction: getQuizGenerationSystemPrompt(difficulty as 'warmup' | 'solid' | 'spicy'),
          responseMimeType: 'application/json',
          responseSchema: GEMINI_QUIZ_QUESTION_SCHEMA,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('No text content in Gemini response');
      }

      parsed = JSON.parse(responseText);
    } else {
      // Anthropic
      const client = getAnthropicClient();

      const response = await client.messages.create({
        model: MODELS.QUIZ_GENERATE,
        max_tokens: 1024,
        system: getQuizGenerationSystemPrompt(difficulty as 'warmup' | 'solid' | 'spicy'),
        messages: [
          {
            role: 'user',
            content: getQuizGenerationUserPrompt(transcript),
          },
        ],
        output_config: {
          format: {
            type: 'json_schema',
            schema: QUIZ_QUESTION_JSON_SCHEMA,
          },
        },
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in response');
      }

      parsed = JSON.parse(textBlock.text);
    }

    // Parse and validate with Zod
    const validated = QuizQuestionSchema.parse(parsed);
    const question = validateQuizQuestion(validated);

    // Shuffle answers server-side to defeat LLM position bias
    question.answers = shuffleArray(question.answers);

    return new Response(JSON.stringify(question), {
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Quiz generation error:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: 'Failed to generate quiz question' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
