// Centralized game + skill configuration — single source of truth
// No React/lucide imports here (server-compatible). Icons are in game-icons.ts.

export type SkillId = 'reflex' | 'logic' | 'focus' | 'memory' | 'pattern'

export interface SkillDef {
  id: SkillId
  name: string
  /** Primary hex color from the logo pentagon slice */
  hex: string
  /** Lighter hex variant for dark-mode text readability */
  hexLight: string
  colors: {
    bg: string
    text: string
    border: string
    dot: string
    // Light-mode-safe text variant
    textLight: string
  }
}

export const SKILLS: Record<SkillId, SkillDef> = {
  reflex: {
    id: 'reflex',
    name: 'Reflex',
    hex: '#E9A90B',
    hexLight: '#E7B73F',
    colors: {
      bg: 'bg-[#E9A90B]/20',
      text: 'text-[#E7B73F]',
      textLight: 'text-[#E9A90B]',
      border: 'border-[#E9A90B]',
      dot: 'bg-[#E9A90B]',
    },
  },
  logic: {
    id: 'logic',
    name: 'Logic',
    hex: '#456F8C',
    hexLight: '#5E89A6',
    colors: {
      bg: 'bg-[#456F8C]/20',
      text: 'text-[#5E89A6]',
      textLight: 'text-[#456F8C]',
      border: 'border-[#456F8C]',
      dot: 'bg-[#456F8C]',
    },
  },
  focus: {
    id: 'focus',
    name: 'Focus',
    hex: '#EA4E1E',
    hexLight: '#E27959',
    colors: {
      bg: 'bg-[#EA4E1E]/20',
      text: 'text-[#E27959]',
      textLight: 'text-[#EA4E1E]',
      border: 'border-[#EA4E1E]',
      dot: 'bg-[#EA4E1E]',
    },
  },
  memory: {
    id: 'memory',
    name: 'Memory',
    hex: '#7A41B1',
    hexLight: '#9368BD',
    colors: {
      bg: 'bg-[#7A41B1]/20',
      text: 'text-[#9368BD]',
      textLight: 'text-[#7A41B1]',
      border: 'border-[#7A41B1]',
      dot: 'bg-[#7A41B1]',
    },
  },
  pattern: {
    id: 'pattern',
    name: 'Pattern',
    hex: '#599865',
    hexLight: '#7AAA83',
    colors: {
      bg: 'bg-[#599865]/20',
      text: 'text-[#7AAA83]',
      textLight: 'text-[#599865]',
      border: 'border-[#599865]',
      dot: 'bg-[#599865]',
    },
  },
}

export const SKILL_LIST = Object.values(SKILLS)

/** Hex color per skill — derived from SKILLS, used for charts, logo SVG, etc. */
export const SKILL_HEX: Record<SkillId, string> = Object.fromEntries(
  Object.values(SKILLS).map(s => [s.id, s.hex])
) as Record<SkillId, string>

/**
 * Pentagon logo SVG polygon data — one slice per skill in SKILL_LIST order.
 * Vertices of a regular pentagon centered at (256,256), radius 155.
 * Each entry: [outerPoint1, outerPoint2, center] forming a triangle slice.
 */
export const LOGO_POLYGONS: { skill: SkillId; points: string }[] = [
  // Shrunk 6% toward each triangle's centroid for transparent gaps between slices
  { skill: 'reflex',  points: '253,106 115,207 253,252' },  // top-left (yellow)
  { skill: 'logic',   points: '259,106 397,207 259,252' },  // top-right (blue)
  { skill: 'focus',   points: '399,212 346,375 261,258' },  // right (red)
  { skill: 'memory',  points: '342,379 170,379 256,261' },  // bottom (purple)
  { skill: 'pattern', points: '166,375 113,212 251,258' },  // left (green)
]

export interface GameDef {
  id: string
  name: string
  description: string
  skill: SkillId
  iconColors: { bg: string; icon: string }
  dbGameTypeId: string
}

export const GAMES: Record<string, GameDef> = {
  emoji_keypad: {
    id: 'emoji_keypad',
    name: 'Sequence',
    description: 'Memorize and repeat the emoji pattern',
    skill: 'memory',
    iconColors: { bg: 'bg-[#7A41B1]/20', icon: 'text-[#7A41B1]' },
    dbGameTypeId: 'emoji_keypad_sequence',
  },
  image_rotate: {
    id: 'image_rotate',
    name: 'Puzzle Spin',
    description: 'Rotate tiles to complete the image',
    skill: 'logic',
    iconColors: { bg: 'bg-[#456F8C]/20', icon: 'text-[#456F8C]' },
    dbGameTypeId: 'image_rotate',
  },
  reaction_time: {
    id: 'reaction_time',
    name: 'Reaction Tap',
    description: 'Tap when the color changes. Skip the fakes.',
    skill: 'reflex',
    iconColors: { bg: 'bg-[#E9A90B]/20', icon: 'text-[#E9A90B]' },
    dbGameTypeId: 'reaction_time',
  },
  whack_a_mole: {
    id: 'whack_a_mole',
    name: 'Whack-a-Mole',
    description: 'Tap the moles as fast as you can. Avoid the bombs.',
    skill: 'reflex',
    iconColors: { bg: 'bg-[#E9A90B]/20', icon: 'text-[#E9A90B]' },
    dbGameTypeId: 'whack_a_mole',
  },
  typing_speed: {
    id: 'typing_speed',
    name: 'Typing Speed',
    description: 'Type the text as fast and accurately as you can.',
    skill: 'pattern',
    iconColors: { bg: 'bg-[#599865]/20', icon: 'text-[#599865]' },
    dbGameTypeId: 'typing_speed',
  },
  mental_math: {
    id: 'mental_math',
    name: 'Mental Math',
    description: 'Solve arithmetic problems as quickly as possible.',
    skill: 'logic',
    iconColors: { bg: 'bg-[#456F8C]/20', icon: 'text-[#456F8C]' },
    dbGameTypeId: 'mental_math',
  },
  color_match: {
    id: 'color_match',
    name: 'Color Match',
    description: 'Match the target color as closely as you can.',
    skill: 'focus',
    iconColors: { bg: 'bg-[#EA4E1E]/20', icon: 'text-[#EA4E1E]' },
    dbGameTypeId: 'color_match',
  },
  visual_diff: {
    id: 'visual_diff',
    name: 'Spot the Diff',
    description: 'Find the differences between the two images.',
    skill: 'focus',
    iconColors: { bg: 'bg-[#EA4E1E]/20', icon: 'text-[#EA4E1E]' },
    dbGameTypeId: 'visual_diff',
  },
  audio_pattern: {
    id: 'audio_pattern',
    name: 'Simon Says',
    description: 'Listen to the pattern, then repeat it.',
    skill: 'pattern',
    iconColors: { bg: 'bg-[#599865]/20', icon: 'text-[#599865]' },
    dbGameTypeId: 'audio_pattern',
  },
  drag_sort: {
    id: 'drag_sort',
    name: 'Drag & Sort',
    description: 'Drag the items into the correct order.',
    skill: 'logic',
    iconColors: { bg: 'bg-[#456F8C]/20', icon: 'text-[#456F8C]' },
    dbGameTypeId: 'drag_sort',
  },
  follow_me: {
    id: 'follow_me',
    name: 'Follow Me',
    description: 'Trace the path from start to finish. 3 levels.',
    skill: 'focus',
    iconColors: { bg: 'bg-[#EA4E1E]/20', icon: 'text-[#EA4E1E]' },
    dbGameTypeId: 'follow_me',
  },
  duck_shoot: {
    id: 'duck_shoot',
    name: 'Target Shoot',
    description: 'Tap to fire. Hit red. Avoid green.',
    skill: 'reflex',
    iconColors: { bg: 'bg-[#E9A90B]/20', icon: 'text-[#E9A90B]' },
    dbGameTypeId: 'duck_shoot',
  },
  memory_cards: {
    id: 'memory_cards',
    name: 'Memory Cards',
    description: 'Flip cards and find all matching pairs.',
    skill: 'memory',
    iconColors: { bg: 'bg-[#7A41B1]/20', icon: 'text-[#7A41B1]' },
    dbGameTypeId: 'memory_cards',
  },
  number_chain: {
    id: 'number_chain',
    name: 'Number Chain',
    description: 'Tap the numbers in ascending order.',
    skill: 'logic',
    iconColors: { bg: 'bg-[#456F8C]/20', icon: 'text-[#456F8C]' },
    dbGameTypeId: 'number_chain',
  },
  gridlock: {
    id: 'gridlock',
    name: 'Gridlock',
    description: 'Slide blocks to free the green piece. 3 rounds.',
    skill: 'focus',
    iconColors: { bg: 'bg-[#EA4E1E]/20', icon: 'text-[#EA4E1E]' },
    dbGameTypeId: 'gridlock',
  },
  reaction_bars: {
    id: 'reaction_bars',
    name: 'Reaction Bars',
    description: 'Stop oscillating bars at the target. Speed + accuracy.',
    skill: 'reflex',
    iconColors: { bg: 'bg-[#E9A90B]/20', icon: 'text-[#E9A90B]' },
    dbGameTypeId: 'reaction_bars',
  },
  image_puzzle: {
    id: 'image_puzzle',
    name: 'Image Puzzle',
    description: 'Place missing pieces to complete the image.',
    skill: 'focus',
    iconColors: { bg: 'bg-[#EA4E1E]/20', icon: 'text-[#EA4E1E]' },
    dbGameTypeId: 'image_puzzle',
  },
  draw_me: {
    id: 'draw_me',
    name: 'Draw Me',
    description: 'Copy the reference path. 3 rounds of increasing difficulty.',
    skill: 'pattern',
    iconColors: { bg: 'bg-[#599865]/20', icon: 'text-[#599865]' },
    dbGameTypeId: 'draw_me',
  },
  beat_match: {
    id: 'beat_match',
    name: 'Beat Match',
    description: 'Listen to the beat pattern, then tap it back in rhythm.',
    skill: 'pattern',
    iconColors: { bg: 'bg-[#599865]/20', icon: 'text-[#599865]' },
    dbGameTypeId: 'beat_match',
  },
  grid_recall: {
    id: 'grid_recall',
    name: 'Grid Recall',
    description: 'Memorize the pattern, then tap it back.',
    skill: 'memory',
    iconColors: { bg: 'bg-[#7A41B1]/20', icon: 'text-[#7A41B1]' },
    dbGameTypeId: 'grid_recall',
  },
  maze_path: {
    id: 'maze_path',
    name: 'Maze Path',
    description: 'Find and trace the path through the maze.',
    skill: 'pattern',
    iconColors: { bg: 'bg-[#599865]/20', icon: 'text-[#599865]' },
    dbGameTypeId: 'maze_path',
  },
}

export const GAME_LIST = Object.values(GAMES)

// --- Helpers ---

const DB_TO_UI_MAP: Record<string, string> = {
  emoji_keypad_sequence: 'emoji_keypad',
}

export function toUiGameId(dbId: string): string {
  return DB_TO_UI_MAP[dbId] || dbId
}

export function toDbGameTypeId(uiId: string): string {
  return GAMES[uiId]?.dbGameTypeId || uiId
}

export function getSkillForGame(gameId: string): SkillDef | undefined {
  const game = GAMES[gameId]
  if (!game) return undefined
  return SKILLS[game.skill]
}

export function getGameIdsForSkill(skillId: SkillId): string[] {
  return GAME_LIST.filter(g => g.skill === skillId).map(g => g.id)
}

export function getGameName(gameIdOrDbId: string): string {
  const uiId = toUiGameId(gameIdOrDbId)
  return GAMES[uiId]?.name || gameIdOrDbId.replace(/_/g, ' ')
}

export function computeSkillLevel(totalPlays: number): number {
  return Math.min(50, Math.floor(totalPlays / 10) + 1)
}
