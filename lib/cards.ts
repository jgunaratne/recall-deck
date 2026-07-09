// Card splitter shared by the lecture-card renderer and the quiz generator,
// so quiz questions are grounded in exactly the cards the user read.
// Respects code blocks, targets ~1200 characters per card, and treats
// explicit "Card N:" headers as hard card boundaries.

// Matches lines like "**Card 1: Title**", "## Card 2 — Title",
// "### Card 3: Title", or plain "Card 4: Title" at the start of a line.
const CARD_HEADER_RE = /^(?:\*{2}|#{1,6}\s+)?\s*Card\s+\d+\s*[:\u2013\u2014\-]/i;

export function splitIntoCards(content: string): string[] {
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

    // Explicit "Card N:" header always starts a new card (outside code blocks)
    if (!inCodeBlock && CARD_HEADER_RE.test(trimmed)) {
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
