'use client';

import React, { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import RenderingSpinner from './RenderingSpinner';

type MermaidBlockProps = {
  code: string;
  className?: string;
};

// Module-level SVG cache to prevent flickering
const svgCache = new Map<string, string>();

function sanitizeMermaid(code: string): string {
  let result = code;

  // Remove markdown fencing if double wrapped
  result = result.replace(/^```(?:mermaid)?\s*\n/i, '').replace(/\n```\s*$/, '');

  // Fix node labels with special chars: A(Label (with parens)) -> A["Label (with parens)"]
  result = result.replace(
    /(\b\w+)\(([^)]*[(),:;[\]{}][^)]*)\)/g,
    (_, id, label) => `${id}["${label.replace(/"/g, '#quot;')}"]`
  );

  // Fix unquoted labels containing special chars in square brackets: A[Label: something] -> A["Label: something"]
  result = result.replace(
    /(\b\w+)\[([^\]"]*[,:;(){}][^\]"]*)\]/g,
    (_, id, label) => `${id}["${label.replace(/"/g, '#quot;')}"]`
  );

  // Ensure diagram type is present
  const firstLine = result.split('\n')[0].trim().toLowerCase();
  const diagramTypes = [
    'graph', 'flowchart', 'sequencediagram', 'classdiagram',
    'erdiagram', 'statediagram', 'gantt', 'pie', 'gitgraph',
    'timeline', 'mindmap', 'journey', 'quadrantchart',
    'sankey', 'xychart', 'block',
    'statediagram-v2', 'c4context', 'c4container', 'c4component', 'c4deployment',
  ];
  const hasType = diagramTypes.some(t => firstLine.startsWith(t));
  if (!hasType && result.includes('-->')) {
    result = 'graph TD\n' + result;
  }

  return result.trim();
}

export default function MermaidBlock({ code, className }: MermaidBlockProps) {
  const id = useId().replace(/:/g, '_');
  const trimmed = code.trim();

  const [svg, setSvg] = useState<string | null>(() => svgCache.get(trimmed) ?? null);
  const [error, setError] = useState<string | null>(null);
  const lastRenderedCode = useRef<string | null>(svg ? trimmed : null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const handleRefresh = useCallback((e?: MouseEvent) => {
    e?.stopPropagation();
    svgCache.delete(trimmed);
    lastRenderedCode.current = null;
    setSvg(null);
    setError(null);
    setRefreshNonce((n) => n + 1);
  }, [trimmed]);

  useEffect(() => {
    if (!trimmed || trimmed === lastRenderedCode.current) return;

    const cached = svgCache.get(trimmed);
    if (cached) {
      lastRenderedCode.current = trimmed;
      setSvg(cached);
      setError(null);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          fontFamily: 'var(--font-sans)',
          suppressErrorRendering: true,
          themeVariables: {
            darkMode: false,
            background: 'transparent',
            primaryColor: '#ffffff',
            primaryTextColor: '#141413',
            primaryBorderColor: 'rgba(31, 30, 29, 0.2)',
            lineColor: 'rgba(115, 114, 108, 0.6)',
            secondaryColor: '#faf9f5',
            tertiaryColor: '#f0eee6',
            noteBkgColor: '#f0eee6',
            noteTextColor: '#141413',
            noteBorderColor: 'rgba(31, 30, 29, 0.2)',
            edgeLabelBackground: '#faf9f5',
            clusterBkg: 'rgba(31, 30, 29, 0.04)',
            clusterBorder: 'rgba(31, 30, 29, 0.15)',
          },
        });

        const sanitized = sanitizeMermaid(trimmed);
        const mermaidId = `mermaid_${id}_${Date.now()}`;

        let rendered: string;
        try {
          ({ svg: rendered } = await mermaid.render(mermaidId, sanitized));
        } catch {
          const retryId = `mermaid_${id}_${Date.now()}_retry`;
          ({ svg: rendered } = await mermaid.render(retryId, trimmed));
        }

        if (!cancelled) {
          svgCache.set(trimmed, rendered);
          lastRenderedCode.current = trimmed;
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to render diagram');
        }
      }
    }, 500);

    return () => {
      cancelled = false;
      clearTimeout(timer);
    };
  }, [trimmed, id, refreshNonce]);

  const [expanded, setExpanded] = useState(false);
  const closeLightbox = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, closeLightbox]);

  if (error && !svg) {
    return (
      <div className={`my-2 ${className || ''}`}>
        <div className="overflow-x-auto rounded-lg border border-border-soft bg-state-hover-soft p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-tertiary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Diagram could not be rendered
            <button
              type="button"
              onClick={handleRefresh}
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-state-hover hover:text-text-primary"
              title="Retry rendering"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.11"/>
              </svg>
              Retry
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-danger">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    );
  }

  if (!svg) {
    return <RenderingSpinner label="Rendering diagram" className={className} />;
  }

  const scalableSvg = svg
    .replace(/(<svg[^>]*?)\s+width="[^"]*"/i, '$1')
    .replace(/(<svg[^>]*?)\s+height="[^"]*"/i, '$1')
    .replace(/(<svg[^>]*?)\s+style="[^"]*"/i, '$1 style="width:100%;height:auto"');

  return (
    <>
      <div className={`group/mermaid relative my-3 ${className || ''}`}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="cursor-pointer overflow-x-auto rounded-lg border border-border-soft bg-surface p-4 transition-shadow hover:shadow-md
            [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-full [&_svg]:h-auto"
          title="Click to expand diagram"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <button
          type="button"
          onClick={handleRefresh}
          title="Retry rendering"
          aria-label="Retry diagram"
          className="bg-surface/95 border border-border-subtle text-text-tertiary hover:text-text-secondary absolute top-2 right-2 flex w-6 h-6 cursor-pointer items-center justify-center rounded-lg opacity-0 shadow-sm transition-opacity group-hover/mermaid:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.11"/>
          </svg>
        </button>
      </div>

      {expanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={closeLightbox}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeLightbox();
              }}
              aria-label="Close diagram"
              className="absolute top-5 right-5 z-10 flex w-10 h-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div
              className="flex h-[90vh] w-[92vw] items-center justify-center overflow-hidden rounded-xl bg-page p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex h-full w-full items-center justify-center [&_svg]:max-h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: scalableSvg }}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
