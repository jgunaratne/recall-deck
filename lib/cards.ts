// Card splitter shared by the lecture-card renderer and the quiz generator,
// so quiz questions are grounded in exactly the cards the user read.
// Respects code blocks and targets ~1200 characters per card.
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
