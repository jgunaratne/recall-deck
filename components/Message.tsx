'use client';

import React, { useState, useEffect } from 'react';
import MermaidBlock from './MermaidBlock';
import D3Block from './D3Block';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  showQuizButton?: boolean;
  onQuizMe?: () => void;
}

// Convert standard LaTeX equations/formulas into clean readable Unicode
function cleanMathText(math: string): string {
  return math
    .replace(/\\text\{([^}]+)\}/g, '$1') // Strip \text{...} wrappers
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
    .replace(/\\cdot/g, '·')
    .replace(/\\approx/g, '≈')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\\/g, '');                 // Remove residual backslashes
}

// Inline Markdown Parser supporting bold, italic, inline code, links, and inline math $...$
function parseInline(text: string): React.ReactNode[] {
  // Matches inline code (`code`), bold (**bold**), italic (*italic*), links ([text](url)), and inline math ($math$)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|\$[^{$}]+\$)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-xs text-accent">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-accent">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic text-text-secondary">{part.slice(1, -1)}</em>;
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
            className="text-accent underline hover:text-accent-strong transition-colors"
          >
            {match[1]}
          </a>
        );
      }
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return (
        <span key={index} className="font-mono text-sm text-accent bg-state-hover-soft border border-border-soft px-1 py-0.5 rounded">
          {cleanMathText(part.slice(1, -1))}
        </span>
      );
    }
    return part;
  });
}

type BlockSegment =
  | { type: 'text'; content: string }
  | { type: 'mermaid'; code: string }
  | { type: 'd3'; code: string }
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

  const flushCode = () => {
    if (codeBlockType === 'mermaid') {
      segments.push({ type: 'mermaid', code: accumulatedCode.join('\n') });
    } else if (codeBlockType === 'd3') {
      segments.push({ type: 'd3', code: accumulatedCode.join('\n') });
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
    flushCode();
  } else {
    flushText();
  }

  return segments;
}

// Line-by-line block parser converting markdown and LaTeX structures into HTML components
function renderBlock(blockText: string, key: number, showCursor: boolean): React.ReactNode {
  const segments = parseBlockSegments(blockText);

  return (
    <div key={key} className="space-y-3">
      {segments.map((seg, idx) => {
        const isLastSegment = idx === segments.length - 1;
        const segmentCursor = showCursor && isLastSegment;

        if (seg.type === 'mermaid') {
          return <MermaidBlock key={idx} code={seg.code} />;
        }
        if (seg.type === 'd3') {
          return <D3Block key={idx} code={seg.code} />;
        }
        if (seg.type === 'code') {
          return (
            <pre key={idx} className="my-2 p-3 bg-state-hover-soft border border-border-soft rounded-xl overflow-x-auto font-mono text-xs text-text-secondary">
              <code>{seg.code}</code>
            </pre>
          );
        }

        const lines = seg.content.split('\n');
        return (
          <div key={idx} className="space-y-2">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              const isLastLine = lIdx === lines.length - 1;
              const lineCursor = segmentCursor && isLastLine;

              // Block Math: $$ equation $$
              if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
                const formulaText = trimmed.slice(2, -2).trim();
                return (
                  <div
                    key={lIdx}
                    className="my-3 py-3.5 px-4 bg-state-hover-soft border border-border-soft rounded-xl text-center font-mono text-sm md:text-base text-accent shadow-inner overflow-x-auto"
                  >
                    {cleanMathText(formulaText)}
                    {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm align-middle" />}
                  </div>
                );
              }

              // Horizontal Rule: --- or ***
              if (trimmed === '---' || trimmed === '***' || /^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
                return (
                  <hr
                    key={lIdx}
                    className="border-t border-border-soft my-4 w-full"
                  />
                );
              }

              // Header 3
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={lIdx} className="text-base font-bold text-accent mt-3 mb-1 font-serif">
                    {parseInline(trimmed.slice(4))}
                    {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm" />}
                  </h3>
                );
              }

              // Header 2
              if (trimmed.startsWith('## ')) {
                return (
                  <h2 key={lIdx} className="text-lg font-bold text-accent mt-4 mb-2 font-serif">
                    {parseInline(trimmed.slice(3))}
                    {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm" />}
                  </h2>
                );
              }

              // Header 1
              if (trimmed.startsWith('# ')) {
                return (
                  <h1 key={lIdx} className="text-xl font-bold text-accent mt-4 mb-2 font-serif">
                    {parseInline(trimmed.slice(2))}
                    {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm" />}
                  </h1>
                );
              }

              // Bulleted lists (- or *)
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-4 text-sm leading-relaxed">
                    <span className="text-accent select-none mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
                    <span className="flex-1 text-text-primary">
                      {parseInline(trimmed.slice(2))}
                      {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm align-middle" />}
                    </span>
                  </div>
                );
              }

              // Numbered lists (e.g. 1.)
              const numMatch = trimmed.match(/^(\d+)\.\s(.*)$/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-4 text-sm leading-relaxed">
                    <span className="text-accent font-bold font-mono text-xs mt-0.5 select-none">{numMatch[1]}.</span>
                    <span className="flex-1 text-text-primary">
                      {parseInline(numMatch[2])}
                      {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm align-middle" />}
                    </span>
                  </div>
                );
              }

              // Blockquotes
              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote key={lIdx} className="pl-3 border-l-2 border-accent/40 italic text-text-secondary py-0.5 my-1">
                    {parseInline(trimmed.slice(2))}
                    {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm" />}
                  </blockquote>
                );
              }

              // Empty spacer line
              if (trimmed.length === 0) {
                return <div key={lIdx} className="h-2" />;
              }

              // Normal text line
              return (
                <p key={lIdx} className="text-sm md:text-base leading-relaxed text-text-primary">
                  {parseInline(line)}
                  {lineCursor && <span className="inline-block w-2.5 h-4 ml-1 bg-accent animate-pulse rounded-sm align-middle" />}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Custom card splitter that respects code blocks and targets ~1200 characters per card
function splitIntoCards(content: string): string[] {
  const lines = content.split('\n');
  const cards: string[] = [];
  
  let currentCardLines: string[] = [];
  let inCodeBlock = false;
  let currentLength = 0;

  const flushCard = () => {
    if (currentCardLines.length > 0) {
      cards.push(currentCardLines.join('\n').trim());
      currentCardLines = [];
      currentLength = 0;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    currentCardLines.push(line);
    currentLength += line.length + 1;

    // Split on empty lines outside of code blocks if we reached the target length
    if (!inCodeBlock && trimmed.length === 0) {
      if (currentLength > 1000) {
        flushCard();
      }
    }
  }

  flushCard();
  return cards;
}

export default function Message({
  role,
  content,
  isStreaming,
  isLastMessage,
  showQuizButton,
  onQuizMe,
}: MessageProps) {
  const isUser = role === 'user';
  const [currentIndex, setCurrentIndex] = useState(0);

  // Group content into larger, fewer blocks (targeting ~1200 chars per card)
  const blocks = React.useMemo(() => {
    if (isUser) return [];
    return splitIntoCards(content);
  }, [content, isUser]);

  if (!isUser) {
    if (blocks.length === 0) return null;

    const currentBlock = blocks[currentIndex];
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === blocks.length - 1;
    const showCursor = !!isStreaming && isLast;

    return (
      <div className="flex flex-col w-full mb-6 max-w-[95%] mx-auto animate-fade-in">
        {/* Card Stack Container (Premium Light Academy styled) */}
        <div className="relative min-h-[220px] bg-surface border border-border-subtle rounded-2xl p-5 shadow-md flex flex-col justify-between hover:border-accent/30 transition-all duration-300">
          
          {/* Card header / progress indicator */}
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] tracking-wider text-accent font-bold uppercase font-mono">
              📖 LECTURE NOTES
            </span>
            <span className="text-xs text-text-tertiary font-mono">
              Card {currentIndex + 1} of {blocks.length}
            </span>
          </div>

          {/* Card Content with dynamic markdown rendering */}
          <div
            key={currentIndex}
            className="flex-1 text-text-primary text-sm md:text-base leading-relaxed min-h-[100px] animate-fade-in"
          >
            {renderBlock(currentBlock, currentIndex, showCursor)}
          </div>

          {/* Navigation Controls / Quiz Trigger */}
          <div className="mt-5 pt-3 border-t border-border-soft flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={isFirst}
              className="px-3.5 py-2 rounded-xl bg-surface border border-border-subtle text-xs font-semibold text-text-primary
                hover:bg-state-hover active:scale-95 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
            >
              ◀ BACK
            </button>
            
            {/* Slide Dot Indicators */}
            <div className="flex gap-1.5 overflow-x-auto py-1 max-w-[40%] scrollbar-none">
              {blocks.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300 ${
                    idx === currentIndex ? 'bg-accent w-4' : 'bg-state-hover'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            {isLast && isLastMessage && showQuizButton && onQuizMe ? (
              <button
                type="button"
                onClick={onQuizMe}
                className="px-4 py-2 bg-gradient-to-r from-accent-strong to-accent text-surface text-xs font-black rounded-xl
                  shadow-md shadow-accent/15 hover:shadow-lg active:scale-95 transition-all animate-pulse-subtle cursor-pointer"
              >
                📝 POP QUIZ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.min(blocks.length - 1, prev + 1))}
                disabled={isLast}
                className="px-3.5 py-2 rounded-xl bg-accent text-surface text-xs font-bold
                  hover:bg-accent-strong active:scale-95 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer shadow-md shadow-accent/15"
              >
                NEXT ▶
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // User bubble
  return (
    <div className="flex w-full justify-end mb-4">
      <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-user-bubble text-text-primary border border-border-soft rounded-br-md shadow-sm">
        <div className="whitespace-pre-wrap break-words">{content}</div>
      </div>
    </div>
  );
}
