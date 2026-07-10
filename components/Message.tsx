'use client';

import React, { useState } from 'react';
import MermaidBlock from './MermaidBlock';
import D3Block from './D3Block';
import RenderingSpinner from './RenderingSpinner';
import GeminiLiveOverlay from './GeminiLiveOverlay';
import { splitIntoCards } from '@/lib/cards';
import type { ReadingLevel } from '@/lib/prompts';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  showQuizButton?: boolean;
  onQuizMe?: () => void;
  /** Topic the user asked about — used for Gemini Live context */
  topic?: string;
  /** Current reading level */
  readingLevel?: ReadingLevel;
  /** Quiz context to inject into Gemini Live */
  quizContext?: string | null;
  /** Answer result to inject into Gemini Live when student answers a quiz question */
  answerResult?: string | null;
  /** Final quiz result to inject into Gemini Live when the quiz ends */
  quizResult?: string | null;
  /** Whether the quiz is currently active/open */
  isQuizActive?: boolean;
}

// Convert standard LaTeX equations/formulas into clean readable Unicode
function cleanMathText(math: string): string {
  return math
    .replace(/\\text\{([^}]+)\}/g, '$1') // Strip \text{...} wrappers
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2') // \frac{a}{b} -> a/b
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\bar\{([^}]+)\}/g, '$1̄') // combining macron: x̄
    .replace(/\\hat\{([^}]+)\}/g, '$1̂') // combining circumflex: x̂
    .replace(/\^?\\circ/g, '°')          // Convert \circ or ^\circ to degree symbol
    .replace(/\\pm/g, '±')              // Convert standard symbols
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\mu/g, 'μ')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\epsilon/g, 'ε')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\sum/g, 'Σ')
    .replace(/\\cdot/g, '·')
    .replace(/\\approx/g, '≈')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\\/g, '')                  // Remove residual backslashes
    .replace(/[{}]/g, '');               // Remove residual braces
}

// Strip card prefix labels like "Card 1: " or "Card 2 - " from headers
function stripCardLabel(text: string): string {
  const cleaned = text.replace(/^Card\s+\d+\s*[:\-\u2013\u2014]?\s*/i, '');
  if (cleaned.trim().length === 0) {
    return text;
  }
  return cleaned;
}

// Inline Markdown Parser supporting bold, italic, inline code, links, and inline math $...$
// Matches inline code (`code`), bold (**bold**), italic (*italic*), links ([text](url)),
// and inline math ($math$ — first/last chars non-space, so "$5 and" prose is left alone)
const INLINE_TOKEN_REGEX = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|\$[^\s$](?:[^$\n]*[^\s$])?\$)/g;

function parseInline(text: string): React.ReactNode[] {
  const parts = text.split(INLINE_TOKEN_REGEX);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded-sm bg-state-hover px-1 font-mono text-[0.92em] text-text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    // Bold/italic content is parsed recursively so nested tokens like
    // **Data Variability ($\sigma$):** render their inner math/code.
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-text-primary">{parseInline(part.slice(2, -2))}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic">{parseInline(part.slice(1, -1))}</em>;
    }
    if (part.startsWith('[') && part.includes('](')) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        return (
          <a
            key={index}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-strong underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent-strong"
          >
            {match[1]}
          </a>
        );
      }
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return (
        <span key={index} className="rounded-sm bg-state-hover-soft px-1 font-mono text-[0.92em] text-text-secondary">
          {cleanMathText(part.slice(1, -1))}
        </span>
      );
    }
    return part;
  });
}

// GFM-style table: header row, |---|---| separator, body rows.
function MarkdownTable({ rows }: { rows: string[] }) {
  const parseRow = (row: string) => row.slice(1, -1).split('|').map((c) => c.trim());
  const isSeparator = (row: string) => {
    const cells = parseRow(row);
    return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
  };
  const hasHeader = rows.length > 1 && isSeparator(rows[1]);
  const header = hasHeader ? parseRow(rows[0]) : null;
  const bodyRows = rows
    .slice(hasHeader ? 2 : 0)
    .filter((r) => !isSeparator(r))
    .map(parseRow);

  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {header && (
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i} className="border-b border-border-strong px-3 py-2 text-left font-semibold text-text-primary">
                  {parseInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border-b border-border-soft px-3 py-2 align-top leading-relaxed text-text-secondary">
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type BlockSegment =
  | { type: 'text'; content: string }
  | { type: 'mermaid'; code: string; complete: boolean }
  | { type: 'd3'; code: string; complete: boolean }
  | { type: 'code'; language: string; code: string };

function parseBlockSegments(blockText: string): BlockSegment[] {
  const lines = blockText.split('\n');
  const segments: BlockSegment[] = [];

  let inCodeBlock = false;
  let codeBlockType: 'mermaid' | 'd3' | 'code' | null = null;
  let codeBlockLang = '';
  let accumulatedCode: string[] = [];
  let accumulatedText: string[] = [];

  const flushText = () => {
    if (accumulatedText.length > 0) {
      segments.push({ type: 'text', content: accumulatedText.join('\n') });
      accumulatedText = [];
    }
  };

  // `complete` is false when the block was cut off at end-of-content (its
  // closing fence never arrived) — executing such code throws syntax errors.
  const flushCode = (complete = true) => {
    if (codeBlockType === 'mermaid') {
      segments.push({ type: 'mermaid', code: accumulatedCode.join('\n'), complete });
    } else if (codeBlockType === 'd3') {
      segments.push({ type: 'd3', code: accumulatedCode.join('\n'), complete });
    } else if (codeBlockType === 'code') {
      segments.push({ type: 'code', language: codeBlockLang, code: accumulatedCode.join('\n') });
    }
    accumulatedCode = [];
    codeBlockType = null;
    codeBlockLang = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushText();
        inCodeBlock = true;
        const lang = trimmed.slice(3).trim().toLowerCase();
        if (lang === 'mermaid') {
          codeBlockType = 'mermaid';
        } else if (lang === 'd3') {
          codeBlockType = 'd3';
        } else {
          codeBlockType = 'code';
          codeBlockLang = lang;
        }
      }
    } else {
      if (inCodeBlock) {
        accumulatedCode.push(line);
      } else {
        accumulatedText.push(line);
      }
    }
  }

  if (inCodeBlock) {
    flushCode(false);
  } else {
    flushText();
  }

  return segments;
}

function StreamCursor() {
  return <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-xs bg-accent align-middle" />;
}

// Line-by-line block parser converting markdown and LaTeX structures into HTML components
function renderBlock(blockText: string, key: number, showCursor: boolean): React.ReactNode {
  const segments = parseBlockSegments(blockText);

  return (
    <div key={key} className="space-y-3">
      {segments.map((seg, idx) => {
        const isLastSegment = idx === segments.length - 1;
        const segmentCursor = showCursor && isLastSegment;

        // While the block is still streaming in (no closing fence yet),
        // show a spinner instead of executing half-written code.
        if (seg.type === 'mermaid') {
          if (!seg.complete && showCursor) {
            return <RenderingSpinner key={idx} label="Rendering diagram" />;
          }
          return <MermaidBlock key={idx} code={seg.code} />;
        }
        if (seg.type === 'd3') {
          if (!seg.complete && showCursor) {
            return <RenderingSpinner key={idx} label="Rendering visualization" />;
          }
          return <D3Block key={idx} code={seg.code} />;
        }
        if (seg.type === 'code') {
          return (
            <pre key={idx} className="my-2 overflow-x-auto rounded-lg bg-state-hover-soft p-3 font-mono text-xs leading-relaxed text-text-secondary">
              <code>{seg.code}</code>
            </pre>
          );
        }

        const lines = seg.content.split('\n');

        // Group consecutive table rows (| ... |) so they render as real
        // tables instead of falling through to plain text. Blank lines
        // between rows are tolerated — models sometimes emit them.
        type LineItem = { kind: 'line'; line: string } | { kind: 'table'; rows: string[] };
        const items: LineItem[] = [];
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i].trim();
          const prev = items[items.length - 1];
          if (t.startsWith('|') && t.endsWith('|') && t.length > 2) {
            if (prev?.kind === 'table') {
              prev.rows.push(t);
            } else {
              items.push({ kind: 'table', rows: [t] });
            }
          } else if (
            t === '' &&
            prev?.kind === 'table' &&
            lines
              .slice(i + 1)
              .find((l) => l.trim() !== '')
              ?.trim()
              .startsWith('|')
          ) {
            // blank line inside a table — swallow it so the run continues
          } else {
            items.push({ kind: 'line', line: lines[i] });
          }
        }

        return (
          <div key={idx} className="space-y-2">
            {items.map((item, lIdx) => {
              const isLastLine = lIdx === items.length - 1;
              const lineCursor = segmentCursor && isLastLine;

              if (item.kind === 'table') {
                return <MarkdownTable key={lIdx} rows={item.rows} />;
              }

              const line = item.line;
              const trimmed = line.trim();

              // Block Math: $$ equation $$
              if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
                const formulaText = trimmed.slice(2, -2).trim();
                return (
                  <div
                    key={lIdx}
                    className="my-3 overflow-x-auto rounded-lg bg-state-hover-soft px-4 py-3.5 text-center font-mono text-sm text-text-primary md:text-base"
                  >
                    {cleanMathText(formulaText)}
                    {lineCursor && <StreamCursor />}
                  </div>
                );
              }

              // Horizontal Rule: --- or ***
              if (trimmed === '---' || trimmed === '***' || /^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
                return (
                  <hr
                    key={lIdx}
                    className="my-4 w-full border-t border-border-soft"
                  />
                );
              }

              // Header 6
              if (trimmed.startsWith('###### ')) {
                return (
                  <h6 key={lIdx} className="mt-2 text-sm font-semibold text-text-primary">
                    {parseInline(stripCardLabel(trimmed.slice(7)))}
                    {lineCursor && <StreamCursor />}
                  </h6>
                );
              }

              // Header 5
              if (trimmed.startsWith('##### ')) {
                return (
                  <h5 key={lIdx} className="mt-2 text-sm font-semibold text-text-primary">
                    {parseInline(stripCardLabel(trimmed.slice(6)))}
                    {lineCursor && <StreamCursor />}
                  </h5>
                );
              }

              // Header 4
              if (trimmed.startsWith('#### ')) {
                return (
                  <h4 key={lIdx} className="mt-3 text-[15px] font-semibold text-text-primary">
                    {parseInline(stripCardLabel(trimmed.slice(5)))}
                    {lineCursor && <StreamCursor />}
                  </h4>
                );
              }

              // Header 3
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={lIdx} className="mt-3 text-base font-semibold text-text-primary">
                    {parseInline(stripCardLabel(trimmed.slice(4)))}
                    {lineCursor && <StreamCursor />}
                  </h3>
                );
              }

              // Header 2
              if (trimmed.startsWith('## ')) {
                return (
                  <h2 key={lIdx} className="mt-4 text-lg font-semibold text-text-primary">
                    {parseInline(stripCardLabel(trimmed.slice(3)))}
                    {lineCursor && <StreamCursor />}
                  </h2>
                );
              }

              // Header 1
              if (trimmed.startsWith('# ')) {
                return (
                  <h1 key={lIdx} className="mt-4 text-xl font-semibold text-text-primary">
                    {parseInline(stripCardLabel(trimmed.slice(2)))}
                    {lineCursor && <StreamCursor />}
                  </h1>
                );
              }

              // Bulleted lists (- or *)
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2.5 pl-2 leading-relaxed">
                    <span className="mt-[0.6em] h-1.5 w-1.5 flex-shrink-0 select-none rounded-full bg-text-tertiary/50" />
                    <span className="flex-1">
                      {parseInline(trimmed.slice(2))}
                      {lineCursor && <StreamCursor />}
                    </span>
                  </div>
                );
              }

              // Numbered lists (e.g. 1.)
              const numMatch = trimmed.match(/^(\d+)\.\s(.*)$/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-2.5 pl-2 leading-relaxed">
                    <span className="min-w-[1.1em] select-none text-right text-text-tertiary tabular-nums">{numMatch[1]}.</span>
                    <span className="flex-1">
                      {parseInline(numMatch[2])}
                      {lineCursor && <StreamCursor />}
                    </span>
                  </div>
                );
              }

              // Blockquotes
              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote key={lIdx} className="my-1 border-l-2 border-border-subtle py-0.5 pl-3 italic text-text-secondary">
                    {parseInline(trimmed.slice(2))}
                    {lineCursor && <StreamCursor />}
                  </blockquote>
                );
              }

              // Empty spacer line
              if (trimmed.length === 0) {
                return <div key={lIdx} className="h-2" />;
              }

              // Normal text line
              return (
                <p key={lIdx} className="leading-relaxed">
                  {parseInline(line)}
                  {lineCursor && <StreamCursor />}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function Message({
  role,
  content,
  isStreaming,
  isLastMessage,
  showQuizButton,
  onQuizMe,
  topic,
  readingLevel = 'high',
  quizContext,
  answerResult,
  quizResult,
  isQuizActive,
}: MessageProps) {
  const isUser = role === 'user';
  const [currentIndex, setCurrentIndex] = useState(0);

  // Group content into larger, fewer blocks (targeting ~1200 chars per card)
  const blocks = React.useMemo(() => {
    if (isUser) return [];
    return splitIntoCards(content);
  }, [content, isUser]);

  // While streaming, new cards accumulate off-screen: the user stays on the
  // card they're reading and advances at their own pace (the counter and
  // Next button reflect newly arrived cards).

  if (!isUser) {
    // Show a loading card while waiting for the first streaming chunk
    if (blocks.length === 0) {
      if (isStreaming && isLastMessage) {
        return (
          <div className="mt-6 w-full animate-fade-in">
            <div className="flex flex-col rounded-lg bg-surface shadow-input">
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  Lecture notes
                </span>
              </div>
              <div className="flex min-h-[120px] items-center justify-center px-5 py-6">
                <div className="flex items-center gap-3 text-sm text-text-tertiary">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ animation: 'spin 1s linear infinite', animationDelay: `${-(Date.now() % 1000)}ms` }}
                  >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <span>Preparing lecture notes…</span>
                </div>
              </div>
            </div>
          </div>
        );
      }
      return null;
    }

    const safeIndex = Math.min(currentIndex, blocks.length - 1);
    const currentBlock = blocks[safeIndex];
    const isFirst = safeIndex === 0;
    const isLast = safeIndex === blocks.length - 1;
    const showCursor = !!isStreaming && isLast;

    return (
      <div className="mt-6 w-full animate-fade-in">
        <div className="flex flex-col rounded-lg bg-surface shadow-input">
          {/* Card header / progress indicator */}
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
              Lecture notes
            </span>
            <div className="flex items-center gap-2.5 text-xs tabular-nums text-text-tertiary">
              {isStreaming && isLastMessage && !isLast && (
                <span className="flex items-center gap-1.5 text-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Writing
                </span>
              )}
              {/* Voice tutor lives on the latest lecture only — one Live
                  session at a time, following the newest cards. */}
              {topic && isLastMessage && (
                <GeminiLiveOverlay
                  topic={topic}
                  readingLevel={readingLevel}
                  isStreaming={!!isStreaming}
                  currentCardContent={currentBlock}
                  quizContext={quizContext ?? null}
                  answerResult={answerResult ?? null}
                  quizResult={quizResult ?? null}
                  allCards={blocks}
                  isQuizActive={isQuizActive}
                />
              )}
              {blocks.length > 1 && <span>{safeIndex + 1} of {blocks.length}</span>}
            </div>
          </div>

          {/* Card content */}
          <div
            key={safeIndex}
            className="min-h-[100px] flex-1 animate-fade-in px-5 py-4 font-text text-base text-text-primary"
          >
            {renderBlock(currentBlock, safeIndex, showCursor)}
          </div>

          {/* Navigation / quiz trigger */}
          {(blocks.length > 1 || (isLast && isLastMessage && showQuizButton && onQuizMe)) && (
            <div className="flex items-center justify-between gap-3 border-t border-border-soft px-4 py-3">
              <button
                type="button"
                onClick={() => setCurrentIndex(Math.max(0, safeIndex - 1))}
                disabled={isFirst}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border-[0.5px]
                  border-border-subtle bg-transparent px-3 text-sm text-text-secondary
                  transition-colors hover:bg-state-hover
                  disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeftIcon />
                Back
              </button>

              {/* Slide dot indicators */}
              {blocks.length > 1 && (
                <div className="scrollbar-none flex max-w-[40%] gap-1.5 overflow-x-auto py-1">
                  {blocks.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-1.5 flex-shrink-0 cursor-pointer rounded-full transition-all duration-300 ${
                        idx === safeIndex ? 'w-4 bg-accent' : 'w-1.5 bg-border-subtle hover:bg-text-tertiary/40'
                      }`}
                      aria-label={`Go to card ${idx + 1}`}
                    />
                  ))}
                </div>
              )}

              {isLast && isLastMessage && showQuizButton && onQuizMe ? (
                <button
                  type="button"
                  onClick={onQuizMe}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md
                    bg-accent-strong px-3.5 text-sm font-medium text-white
                    transition-opacity hover:opacity-90"
                >
                  Quiz me
                  <ChevronRightIcon />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentIndex(Math.min(blocks.length - 1, safeIndex + 1))}
                  disabled={isLast}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border-[0.5px]
                    border-border-subtle bg-transparent px-3 text-sm text-text-secondary
                    transition-colors hover:bg-state-hover
                    disabled:pointer-events-none disabled:opacity-40"
                >
                  Next
                  <ChevronRightIcon />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // User bubble
  return (
    <div className="mb-2 mt-8 flex w-full justify-end">
      <div className="max-w-[85%] break-words rounded-lg bg-user-bubble px-4 py-2.5 font-text text-base leading-snug text-text-primary">
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}
