// Card splitter shared by the lecture-card renderer and the quiz generator,
// so quiz questions are grounded in exactly the cards the user read.
// Respects code blocks, targets ~1200 characters per card, and treats
// explicit "Card N:" headers as hard card boundaries.

// Matches lines like "**Card 1: Title**", "## Card 2 — Title",
// "### Card 3: Title", or plain "Card 4: Title" at the start of a line.
const CARD_HEADER_RE = /^(?:\*{2}|#{1,6}\s+)?\s*Card\s+\d+\s*[:\u2013\u2014\-]/i;

// Markdown section titles: "## Heading" or a standalone short bold line.
// These are preferred split points \u2014 a card should never end with a title
// whose body lands on the next card.
const SECTION_HEADING_RE = /^#{1,6}\s+\S/;
const BOLD_TITLE_RE = /^\*\*[^*]{1,80}\*\*:?\s*$/;

// Flush before a section heading once the current card has this much
// content. Must stay well below the blank-line threshold (500) so a
// heading can never sit at the tail of a card that then hits that limit.
const HEADING_SPLIT_MIN = 200;

// Markdown horizontal rules: ---, ***, ___ (3 or more).
const DIVIDER_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function splitIntoCards(content: string): string[] {
  const lines = content.split('\n');
  const cards: string[] = [];

  let currentCardLines: string[] = [];
  let inCodeBlock = false;
  let currentLength = 0;

  const flushCard = () => {
    // Drop divider and blank lines at the card edges — a trailing "---"
    // with nothing under it renders as a dangling rule at the bottom of a
    // card, and a leading one as a stray rule above the next card's title.
    while (currentCardLines.length > 0) {
      const first = currentCardLines[0].trim();
      if (first !== '' && !DIVIDER_RE.test(first)) break;
      currentCardLines.shift();
    }
    while (currentCardLines.length > 0) {
      const last = currentCardLines[currentCardLines.length - 1].trim();
      if (last !== '' && !DIVIDER_RE.test(last)) break;
      currentCardLines.pop();
    }
    if (currentCardLines.length > 0) {
      cards.push(currentCardLines.join('\n').trim());
    }
    currentCardLines = [];
    currentLength = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    // Explicit "Card N:" header always starts a new card (outside code blocks)
    if (!inCodeBlock && CARD_HEADER_RE.test(trimmed)) {
      flushCard();
    } else if (
      // Section titles start a new card too once the current one has real
      // content — otherwise the length-based split below can strand a title
      // at the bottom of a card with its body on the next one.
      !inCodeBlock &&
      currentLength > HEADING_SPLIT_MIN &&
      (SECTION_HEADING_RE.test(trimmed) || BOLD_TITLE_RE.test(trimmed))
    ) {
      flushCard();
    }

    currentCardLines.push(line);
    currentLength += line.length + 1;

    // Split on empty lines outside of code blocks if we reached the target length
    if (!inCodeBlock && trimmed.length === 0) {
      if (currentLength > 500) {
        flushCard();
      }
    }
  }

  flushCard();
  return cards.filter((c) => c.length > 0);
}
