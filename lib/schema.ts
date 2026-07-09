import { z } from 'zod';

export const AnswerSchema = z.object({
  text: z.string(),
  is_correct: z.boolean(),
  why_tempting: z.string(),
});

export const QuizQuestionSchema = z.object({
  concept_tested: z.string(),
  misconception: z.string(),
  question: z.string(),
  host_intro: z.string(),
  difficulty: z.enum(['warmup', 'solid', 'spicy']),
  answers: z.array(AnswerSchema),
});

// Post-validation: exactly 4 answers, exactly 1 correct
export function validateQuizQuestion(data: z.infer<typeof QuizQuestionSchema>) {
  if (data.answers.length !== 4) {
    throw new Error(`Expected 4 answers, got ${data.answers.length}`);
  }
  const correctCount = data.answers.filter(a => a.is_correct).length;
  if (correctCount !== 1) {
    throw new Error(`Expected exactly 1 correct answer, got ${correctCount}`);
  }
  return data;
}

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;

// JSON Schema for Claude structured outputs
// Note: additionalProperties: false is required, minItems/maxLength not supported
export const QUIZ_QUESTION_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    concept_tested: { type: 'string' as const, description: 'The single claim from the explanation this question tests' },
    misconception: { type: 'string' as const, description: 'The specific plausible misconception this question targets' },
    question: { type: 'string' as const, description: 'Max 25 words. Tests understanding, not verbatim recall of phrasing.' },
    host_intro: { type: 'string' as const, description: 'One-line Monty setup for this question, max 15 words' },
    difficulty: { type: 'string' as const, enum: ['warmup', 'solid', 'spicy'] },
    answers: {
      type: 'array' as const,
      description: 'Exactly 4 items. Exactly one has is_correct=true.',
      items: {
        type: 'object' as const,
        properties: {
          text: { type: 'string' as const, description: 'Max 8 words' },
          is_correct: { type: 'boolean' as const },
          why_tempting: { type: 'string' as const, description: 'Why a learner would pick this. For the correct answer: why it is right.' },
        },
        required: ['text', 'is_correct', 'why_tempting'] as const,
        additionalProperties: false as const,
      },
    },
  },
  required: ['concept_tested', 'misconception', 'question', 'host_intro', 'difficulty', 'answers'] as const,
  additionalProperties: false as const,
};
