import { getAnthropicClient, MODELS } from '@/lib/anthropic';
import { getGeminiClient, GEMINI_MODELS, withGeminiFallback } from '@/lib/gemini';
import { getOpenAIClient, OPENAI_MODELS } from '@/lib/openai';
import {
  getQuizGenerationSystemPrompt,
  getQuizGenerationUserPrompt,
  READING_LEVELS,
  type ReadingLevel,
} from '@/lib/prompts';
import { QuizQuestionSchema, validateQuizQuestion, QUIZ_QUESTION_JSON_SCHEMA } from '@/lib/schema';
import { shuffleArray } from '@/lib/shuffle';
import { getPreferredAvailableProvider, resolveProvider } from '@/lib/provider';
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
      enum: ['warmup', 'solid', 'tricky'],
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
    const { transcript, difficulty = 'solid', previousQuestions } = body;
    const provider = resolveProvider(body);
    const preferredProvider = getPreferredAvailableProvider();
    const readingLevel: ReadingLevel = READING_LEVELS.includes(body.readingLevel)
      ? body.readingLevel
      : 'high';

    if (!preferredProvider) {
      return new Response(JSON.stringify({ error: 'No AI provider is configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!transcript || typeof transcript !== 'string') {
      return new Response(JSON.stringify({ error: 'Transcript is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate difficulty
    const validDifficulties = ['warmup', 'solid', 'tricky'] as const;
    if (!validDifficulties.includes(difficulty)) {
      return new Response(JSON.stringify({ error: 'Invalid difficulty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validatedPreviousQuestions = Array.isArray(previousQuestions)
      ? previousQuestions.filter((q): q is string => typeof q === 'string')
      : [];

    let parsed: unknown;

    if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
      const ai = getGeminiClient();

      const response = await withGeminiFallback(GEMINI_MODELS.QUIZ_GENERATE, (model) =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ text: getQuizGenerationUserPrompt(transcript, validatedPreviousQuestions) }],
            },
          ],
          config: {
            systemInstruction: getQuizGenerationSystemPrompt(difficulty as 'warmup' | 'solid' | 'tricky', readingLevel),
            responseMimeType: 'application/json',
            responseSchema: GEMINI_QUIZ_QUESTION_SCHEMA,
          },
        }),
      );

      const responseText = response.text;
      if (!responseText) {
        throw new Error('No text content in Gemini response');
      }

      parsed = JSON.parse(responseText);
    } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      const client = getOpenAIClient();

      const response = await client.responses.create({
        model: OPENAI_MODELS.QUIZ_GENERATE,
        instructions: getQuizGenerationSystemPrompt(difficulty as 'warmup' | 'solid' | 'tricky', readingLevel),
        input: getQuizGenerationUserPrompt(transcript, validatedPreviousQuestions),
        max_output_tokens: 1024,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'quiz_question',
            schema: QUIZ_QUESTION_JSON_SCHEMA,
            strict: true,
          },
        },
      });

      if (!response.output_text) {
        throw new Error('No text content in OpenAI response');
      }

      parsed = JSON.parse(response.output_text);
    } else {
      // Anthropic
      if (!process.env.ANTHROPIC_API_KEY) {
        return new Response(JSON.stringify({ error: 'Anthropic is not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const client = getAnthropicClient();

      const response = await client.messages.create({
        model: MODELS.QUIZ_GENERATE,
        max_tokens: 1024,
        system: getQuizGenerationSystemPrompt(difficulty as 'warmup' | 'solid' | 'tricky', readingLevel),
        messages: [
          {
            role: 'user',
            content: getQuizGenerationUserPrompt(transcript, validatedPreviousQuestions),
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
