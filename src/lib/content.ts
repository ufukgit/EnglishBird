// Önceden üretilmiş statik içerik (content/*.json), tiplenmiş olarak.
import wordsJson from '../../content/words.json';
import patternsJson from '../../content/patterns.json';
import curriculumJson from '../../content/curriculum.json';
import scenariosJson from '../../content/scenarios.speaking.json';
import type { CurriculumDay, PatternEntry, ScenarioSkeleton, WordEntry } from './types';

export const WORDS = wordsJson as WordEntry[];
export const PATTERNS = patternsJson as PatternEntry[];
export const CURRICULUM = curriculumJson as CurriculumDay[];
export const SPEAKING_SCENARIOS = scenariosJson as ScenarioSkeleton[];

const wordById = new Map(WORDS.map((w) => [w.id, w]));
const patternById = new Map(PATTERNS.map((p) => [p.id, p]));

export const getWord = (id: string) => wordById.get(id);
export const getPattern = (id: string) => patternById.get(id);
