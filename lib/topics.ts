import type { ReadingLevel } from './prompts';

export type Topic = {
  label: string;
  prompt: string;
};

const ELEMENTARY_TOPICS: Topic[] = [
  { label: 'Sky colors', prompt: 'Why is the sky blue?' },
  { label: 'Fish secrets', prompt: 'How do fish breathe underwater?' },
  { label: 'Leaf magic', prompt: 'Why do leaves change color?' },
  { label: 'Cloud stuff', prompt: 'What are clouds made of?' },
  { label: 'Bird flight', prompt: 'How do birds fly?' },
  { label: 'Rainy days', prompt: 'Why does it rain?' },
  { label: 'Rainbow wonder', prompt: 'What makes a rainbow?' },
  { label: 'Seed surprise', prompt: 'How do seeds grow into plants?' },
  { label: 'Season switch', prompt: 'Why do we have seasons?' },
  { label: 'Moon rocks', prompt: 'What is the moon made of?' },
  { label: 'Magnet magic', prompt: 'How do magnets stick?' },
  { label: 'Happy tails', prompt: 'Why do dogs wag their tails?' },
  { label: 'Shadow play', prompt: 'What are shadows?' },
  { label: 'Butterfly change', prompt: 'How do butterflies change?' },
  { label: 'Salty sea', prompt: 'Why is the ocean salty?' },
  { label: 'Boom and flash', prompt: 'What makes thunder and lightning?' },
  { label: 'Eye colors', prompt: 'How do our eyes see colors?' },
  { label: 'Water power', prompt: 'Why do we need to drink water?' },
  { label: 'Starry sky', prompt: 'What are stars?' },
  { label: 'Dive deep', prompt: 'How do submarines go underwater?' },
];

const MIDDLE_SCHOOL_TOPICS: Topic[] = [
  { label: 'How muscles work', prompt: 'How do muscles make your body move?' },
  { label: 'Why the sky is blue', prompt: 'Why does the sky look blue during the day?' },
  { label: 'Fractions made easy', prompt: 'Explain fractions using pizza slices and real-life examples' },
  { label: 'What is gravity?', prompt: 'What is gravity and why do things fall down?' },
  { label: 'How batteries work', prompt: 'How does a battery store and release energy?' },
  { label: 'The water cycle', prompt: 'Explain the water cycle step by step' },
  { label: 'How the internet works', prompt: 'How does a website appear on my screen when I click a link?' },
  { label: 'What causes earthquakes', prompt: 'What causes earthquakes and how do they happen?' },
  { label: 'Why we need sleep', prompt: 'Why do humans need to sleep every night?' },
  { label: 'How plants eat sunlight', prompt: 'How do plants turn sunlight into food?' },
  { label: 'What is a black hole?', prompt: 'What is a black hole and could one swallow the Earth?' },
  { label: 'How your brain learns', prompt: 'How does your brain remember things you study?' },
  { label: 'DNA basics', prompt: 'What is DNA and why does it make everyone look different?' },
  { label: 'How magnets attract', prompt: 'How do magnets work and why do they stick to some metals?' },
  { label: 'Stars and constellations', prompt: 'Why do stars look like they form shapes in the sky?' },
  { label: 'What makes a rainbow', prompt: 'How does a rainbow form after it rains?' },
  { label: 'Volcanoes explained', prompt: 'What makes a volcano erupt and what comes out?' },
  { label: 'Why ice floats', prompt: 'Why does ice float on water instead of sinking?' },
  { label: 'Animal camouflage', prompt: 'How do animals use camouflage to hide from predators?' },
  { label: 'Sound and vibrations', prompt: 'How does sound travel from a guitar string to your ear?' },
];

const HIGH_SCHOOL_TOPICS: Topic[] = [
  { label: 'Grasp statistics', prompt: 'Explain confidence intervals in simple terms' },
  { label: 'Picture the math', prompt: 'What are vectors in geometry and how do they work?' },
  { label: 'Natural selection', prompt: 'How does natural selection drive evolution over time?' },
  { label: 'Chemical bonding', prompt: 'What is the difference between ionic and covalent bonds?' },
  { label: 'Supply and demand', prompt: 'How do supply and demand curves determine market prices?' },
  { label: 'How vaccines work', prompt: 'How does a vaccine train your immune system?' },
  { label: 'The cell cycle', prompt: 'Walk me through the stages of mitosis and why cells divide' },
  { label: 'Electricity basics', prompt: 'What are voltage, current, and resistance and how do they relate?' },
  { label: 'Climate vs weather', prompt: 'What is the difference between climate and weather?' },
  { label: 'Probability traps', prompt: 'Explain the Monty Hall problem and why switching is better' },
  { label: 'How lenses work', prompt: 'How do convex and concave lenses bend light differently?' },
  { label: 'Atomic structure', prompt: 'Explain the structure of an atom and how electrons are arranged' },
  { label: 'Plate tectonics', prompt: 'How do tectonic plates move and what effects does this have?' },
  { label: 'The French Revolution', prompt: 'What caused the French Revolution and what were its major phases?' },
  { label: 'Photosynthesis deep dive', prompt: 'Walk me through the light and dark reactions of photosynthesis' },
  { label: 'Quadratic equations', prompt: 'Why does the quadratic formula work and when do you use it?' },
  { label: 'Digestive system', prompt: 'How does food get broken down and absorbed in the digestive system?' },
  { label: 'How encryption works', prompt: 'How does encryption keep data safe when you browse the web?' },
  { label: 'Newton\'s three laws', prompt: 'Explain Newton\'s three laws of motion with everyday examples' },
  { label: 'The Cold War', prompt: 'What were the main causes and turning points of the Cold War?' },
];

const UNIVERSITY_TOPICS: Topic[] = [
  { label: 'B-Tree indexing', prompt: 'Why do databases use B-Trees for indexing and how do they maintain balance?' },
  { label: 'Fourier transforms', prompt: 'What is the intuition behind Fourier transforms and where are they used?' },
  { label: 'Game theory equilibria', prompt: 'Explain Nash equilibrium and its limitations in real-world scenarios' },
  { label: 'CRISPR mechanics', prompt: 'How does the CRISPR-Cas9 system edit genes at a molecular level?' },
  { label: 'Consensus protocols', prompt: 'How do distributed consensus algorithms like Raft achieve fault tolerance?' },
  { label: 'Quantum entanglement', prompt: 'What is quantum entanglement and why did Einstein call it spooky action at a distance?' },
  { label: 'P vs NP', prompt: 'What is the P vs NP problem and why does it matter for computer science?' },
  { label: 'General relativity', prompt: 'How does general relativity describe gravity as spacetime curvature?' },
  { label: 'Market microstructure', prompt: 'How do order books and market makers affect price discovery?' },
  { label: 'Compiler design', prompt: 'How does a compiler transform source code through lexing, parsing, and code generation?' },
  { label: 'Bayes\' theorem', prompt: 'Explain Bayesian inference and how prior beliefs update with new evidence' },
  { label: 'Neural backpropagation', prompt: 'How does backpropagation compute gradients in a neural network?' },
  { label: 'Thermodynamics', prompt: 'Explain the laws of thermodynamics and the concept of entropy' },
  { label: 'CAP theorem', prompt: 'What is the CAP theorem and how do distributed databases navigate its trade-offs?' },
  { label: 'Eigenvalues explained', prompt: 'What are eigenvalues and eigenvectors and why are they so important in linear algebra?' },
  { label: 'mRNA translation', prompt: 'How does the ribosome translate mRNA into a protein chain?' },
  { label: 'Public key crypto', prompt: 'How does RSA public-key cryptography work and why is it hard to break?' },
  { label: 'Lambda calculus', prompt: 'What is the lambda calculus and how does it relate to functional programming?' },
  { label: 'Type systems', prompt: 'How do type systems prevent errors and what are dependent types?' },
  { label: 'Mechanism design', prompt: 'What is mechanism design and how does it relate to auction theory?' },
];

const TOPIC_POOLS: Record<ReadingLevel, Topic[]> = {
  elementary: ELEMENTARY_TOPICS,
  middle: MIDDLE_SCHOOL_TOPICS,
  high: HIGH_SCHOOL_TOPICS,
  university: UNIVERSITY_TOPICS,
};

/**
 * Pick `count` random topics from the pool for the given reading level.
 * Uses Fisher-Yates on a copy to avoid showing duplicates.
 */
export function pickTopics(level: ReadingLevel, count = 6): Topic[] {
  const pool = [...TOPIC_POOLS[level]];
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
