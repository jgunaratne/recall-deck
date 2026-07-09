'use client';

import React, { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import RenderingSpinner from './RenderingSpinner';

type D3BlockProps = {
  code: string;
  className?: string;
};

// Module-level SVG cache to prevent flickering
const svgCache = new Map<string, string>();

function fixTextOverlap(svgEl: SVGElement) {
  // Axis labels rotation/spacing logic
  const axisMap = new Map<Element, SVGTextElement[]>();
  for (const tick of svgEl.querySelectorAll('.tick')) {
    const parent = tick.parentElement;
    if (!parent) continue;
    const textEl = tick.querySelector('text');
    if (!textEl) continue;
    if (!axisMap.has(parent)) axisMap.set(parent, []);
    axisMap.get(parent)!.push(textEl as SVGTextElement);
  }

  for (const textEls of axisMap.values()) {
    if (textEls.length < 2) continue;
    if (textEls.some(t => (t.getAttribute('transform') ?? '').includes('rotate'))) continue;

    const sorted = textEls
      .map(t => ({ el: t, r: t.getBoundingClientRect() }))
      .sort((a, b) => a.r.left - b.r.left);

    let horizOverlap = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].r.right + 2 > sorted[i + 1].r.left) {
        horizOverlap = true;
        break;
      }
    }
    if (horizOverlap) {
      textEls.forEach(t => {
        t.setAttribute('transform', 'rotate(-40)');
        t.setAttribute('text-anchor', 'end');
        t.setAttribute('dx', '-0.6em');
        t.setAttribute('dy', '0.5em');
      });
      continue;
    }

    const sortedV = [...sorted].sort((a, b) => a.r.top - b.r.top);
    let vertOverlap = false;
    for (let i = 0; i < sortedV.length - 1; i++) {
      if (sortedV[i].r.bottom + 1 > sortedV[i + 1].r.top) {
        vertOverlap = true;
        break;
      }
    }
    if (vertOverlap) {
      sortedV.forEach((item, i) => {
        if (i % 2 !== 0) item.el.style.display = 'none';
      });
    }
  }

  // Non-axis labels nudge
  const freeTexts = Array.from(
    svgEl.querySelectorAll('text:not(.tick text)')
  ) as SVGTextElement[];

  for (let i = 0; i < freeTexts.length; i++) {
    for (let j = i + 1; j < freeTexts.length; j++) {
      const a = freeTexts[i].getBoundingClientRect();
      const b = freeTexts[j].getBoundingClientRect();
      const overlaps =
        a.right > b.left && b.right > a.left &&
        a.bottom > b.top && b.bottom > a.top;
      if (!overlaps) continue;

      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const cur = parseFloat(freeTexts[j].getAttribute('y') ?? '0');
      if (!isNaN(cur)) freeTexts[j].setAttribute('y', String(cur + overlap + 3));
    }
  }
}

export default function D3Block({ code, className }: D3BlockProps) {
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
        const d3 = await import('d3');
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:0;top:0;width:720px;height:400px;visibility:hidden;pointer-events:none;overflow:hidden';
        document.body.appendChild(container);

        try {
          const safeCode = trimmed
            .replace(/^['"]use strict['"];?\s*/m, '')
            .replace(/^(\s*[\w$][\w$.\[\]'"()=>!, ]*\.\s*\w+)\s*:\s*([^/\n{][^\n]*?);(\s*\/\/[^\n]*)?$/gm, '$1 = $2;$3');

          const fn = new Function(
            'd3',
            'container',
            `{
              const width = 720;
              const height = 400;
              let margin = { top: 40, right: 30, bottom: 110, left: 130 };
              ${safeCode}
            }`
          );
          fn(d3, container);

          const svgEl = container.querySelector('svg');
          if (!svgEl) {
            throw new Error('D3 code did not create an SVG element');
          }

          fixTextOverlap(svgEl);

          if (!svgEl.getAttribute('viewBox')) {
            const w = parseInt(svgEl.getAttribute('width') || '720', 10);
            const h = parseInt(svgEl.getAttribute('height') || '400', 10);
            svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
          }
          svgEl.setAttribute('overflow', 'visible');
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          svgEl.style.width = '100%';
          svgEl.style.height = 'auto';

          const rendered = container.innerHTML;

          if (!cancelled) {
            svgCache.set(trimmed, rendered);
            lastRenderedCode.current = trimmed;
            setSvg(rendered);
            setError(null);
          }
        } finally {
          document.body.removeChild(container);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to render visualization');
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, id, refreshNonce]);

  if (error && !svg) {
    return (
      <div className={`my-2 ${className || ''}`}>
        <div className="bg-slate-50 border border-slate-200 overflow-x-auto rounded-xl p-4">
          <div className="text-[#20252D]/60 mb-2 flex items-center gap-2 text-xs font-medium font-mono">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Visualization could not be rendered
            <button
              type="button"
              onClick={handleRefresh}
              className="text-[#20252D]/60 hover:text-[#20252D] ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-black/5 cursor-pointer font-mono font-bold"
              title="Retry rendering"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.11"/>
              </svg>
              Retry
            </button>
          </div>
          <div className="text-[#C53030] mb-2 text-xs font-mono">{error}</div>
          <details className="text-[#20252D]/60 text-xs">
            <summary className="cursor-pointer font-mono">Show code</summary>
            <pre className="font-mono mt-1 text-xs leading-relaxed whitespace-pre-wrap text-[#20252D]/80">
              <code>{code}</code>
            </pre>
          </details>
        </div>
      </div>
    );
  }

  if (!svg) {
    return <RenderingSpinner label="Rendering visualization" className={className} />;
  }

  const scalableSvg = svg
    .replace(/(<svg[^>]*?)\s+width="[^"]*"/i, '$1')
    .replace(/(<svg[^>]*?)\s+height="[^"]*"/i, '$1')
    .replace(/(<svg[^>]*?)\s+style="[^"]*"/i, '$1 style="width:100%;height:auto"');

  return (
    <>
      <div className={`group/d3 relative my-3 ${className || ''}`}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="d3-chart bg-surface border border-border-subtle cursor-pointer overflow-hidden rounded-xl p-4 transition-all hover:shadow-md
            [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-full [&_svg]:h-auto"
          title="Click to expand visualization"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <button
          type="button"
          onClick={handleRefresh}
          title="Retry rendering"
          aria-label="Retry visualization"
          className="bg-surface/95 border border-border-subtle text-text-tertiary hover:text-text-secondary absolute top-2 right-2 flex w-6 h-6 cursor-pointer items-center justify-center rounded-lg opacity-0 shadow-sm transition-opacity group-hover/d3:opacity-100"
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
              aria-label="Close visualization"
              className="absolute top-5 right-5 z-10 flex w-10 h-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div
              className="bg-[#FAF9F6] flex h-[90vh] w-[92vw] items-center justify-center overflow-hidden rounded-2xl p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="d3-chart flex h-full w-full items-center justify-center [&_svg]:max-h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: scalableSvg }}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
