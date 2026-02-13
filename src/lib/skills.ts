// Centralized game + skill configuration — single source of truth
// No React/lucide imports here (server-compatible). Icons are in game-icons.ts.

export type SkillId = 'reflex' | 'logic' | 'focus' | 'memory' | 'pattern'

export interface SkillDef {
  id: SkillId
  name: string
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
    colors: {
      bg: 'bg-yellow-500/20',
      text: 'text-yellow-400',
      textLight: 'text-yellow-600',
      border: 'border-yellow-500',
      dot: 'bg-yellow-500',
    },
  },
  logic: {
    id: 'logic',
    name: 'Logic',
    colors: {
      bg: 'bg-blue-600/20',
      text: 'text-blue-400',
      textLight: 'text-blue-600',
      border: 'border-blue-600',
      dot: 'bg-blue-600',
    },
  },
  focus: {
    id: 'focus',
    name: 'Focus',
    colors: {
      bg: 'bg-red-500/20',
      text: 'text-red-400',
      textLight: 'text-red-600',
      border: 'border-red-500',
      dot: 'bg-red-500',
    },
  },
  memory: {
    id: 'memory',
    name: 'Memory',
    colors: {
      bg: 'bg-purple-500/20',
      text: 'text-purple-400',
      textLight: 'text-purple-600',
      border: 'border-purple-500',
      dot: 'bg-purple-500',
    },
  },
  pattern: {
    id: 'pattern',
    name: 'Pattern',
    colors: {
      bg: 'bg-green-500/20',
      text: 'text-green-400',
      textLight: 'text-green-600',
      border: 'border-green-500',
      dot: 'bg-green-500',
    },
  },
}

export const SKILL_LIST = Object.values(SKILLS)

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
    iconColors: { bg: 'bg-purple-500/20', icon: 'text-purple-500' },
    dbGameTypeId: 'emoji_keypad_sequence',
  },
  image_rotate: {
    id: 'image_rotate',
    name: 'Puzzle Spin',
    description: 'Rotate tiles to complete the image',
    skill: 'logic',
    iconColors: { bg: 'bg-blue-600/20', icon: 'text-blue-500' },
    dbGameTypeId: 'image_rotate',
  },
  reaction_time: {
    id: 'reaction_time',
    name: 'Reaction Tap',
    description: 'Tap when the color changes. Skip the fakes.',
    skill: 'reflex',
    iconColors: { bg: 'bg-yellow-500/20', icon: 'text-yellow-500' },
    dbGameTypeId: 'reaction_time',
  },
  whack_a_mole: {
    id: 'whack_a_mole',
    name: 'Whack-a-Mole',
    description: 'Tap the moles as fast as you can. Avoid the bombs.',
    skill: 'reflex',
    iconColors: { bg: 'bg-yellow-500/20', icon: 'text-yellow-500' },
    dbGameTypeId: 'whack_a_mole',
  },
  typing_speed: {
    id: 'typing_speed',
    name: 'Typing Speed',
    description: 'Type the text as fast and accurately as you can.',
    skill: 'pattern',
    iconColors: { bg: 'bg-green-500/20', icon: 'text-green-500' },
    dbGameTypeId: 'typing_speed',
  },
  mental_math: {
    id: 'mental_math',
    name: 'Mental Math',
    description: 'Solve arithmetic problems as quickly as possible.',
    skill: 'logic',
    iconColors: { bg: 'bg-blue-600/20', icon: 'text-blue-500' },
    dbGameTypeId: 'mental_math',
  },
  color_match: {
    id: 'color_match',
    name: 'Color Match',
    description: 'Match the target color as closely as you can.',
    skill: 'focus',
    iconColors: { bg: 'bg-red-500/20', icon: 'text-red-500' },
    dbGameTypeId: 'color_match',
  },
  visual_diff: {
    id: 'visual_diff',
    name: 'Spot the Diff',
    description: 'Find the differences between the two images.',
    skill: 'focus',
    iconColors: { bg: 'bg-red-500/20', icon: 'text-red-500' },
    dbGameTypeId: 'visual_diff',
  },
  audio_pattern: {
    id: 'audio_pattern',
    name: 'Simon Says',
    description: 'Listen to the pattern, then repeat it.',
    skill: 'pattern',
    iconColors: { bg: 'bg-green-500/20', icon: 'text-green-500' },
    dbGameTypeId: 'audio_pattern',
  },
  drag_sort: {
    id: 'drag_sort',
    name: 'Drag & Sort',
    description: 'Drag the items into the correct order.',
    skill: 'logic',
    iconColors: { bg: 'bg-blue-600/20', icon: 'text-blue-500' },
    dbGameTypeId: 'drag_sort',
  },
  follow_me: {
    id: 'follow_me',
    name: 'Follow Me',
    description: 'Trace the path from start to finish. 3 levels.',
    skill: 'focus',
    iconColors: { bg: 'bg-red-500/20', icon: 'text-red-500' },
    dbGameTypeId: 'follow_me',
  },
  duck_shoot: {
    id: 'duck_shoot',
    name: 'Target Shoot',
    description: 'Tap to fire. Hit red. Avoid green.',
    skill: 'reflex',
    iconColors: { bg: 'bg-yellow-500/20', icon: 'text-yellow-500' },
    dbGameTypeId: 'duck_shoot',
  },
  memory_cards: {
    id: 'memory_cards',
    name: 'Memory Cards',
    description: 'Flip cards and find all matching pairs.',
    skill: 'memory',
    iconColors: { bg: 'bg-purple-500/20', icon: 'text-purple-500' },
    dbGameTypeId: 'memory_cards',
  },
  number_chain: {
    id: 'number_chain',
    name: 'Number Chain',
    description: 'Tap the numbers in ascending order.',
    skill: 'logic',
    iconColors: { bg: 'bg-blue-600/20', icon: 'text-blue-500' },
    dbGameTypeId: 'number_chain',
  },
  gridlock: {
    id: 'gridlock',
    name: 'Gridlock',
    description: 'Slide blocks to free the green piece. 3 rounds.',
    skill: 'focus',
    iconColors: { bg: 'bg-red-500/20', icon: 'text-red-500' },
    dbGameTypeId: 'gridlock',
  },
  reaction_bars: {
    id: 'reaction_bars',
    name: 'Reaction Bars',
    description: 'Stop oscillating bars at the target. Speed + accuracy.',
    skill: 'reflex',
    iconColors: { bg: 'bg-yellow-500/20', icon: 'text-yellow-500' },
    dbGameTypeId: 'reaction_bars',
  },
  image_puzzle: {
    id: 'image_puzzle',
    name: 'Image Puzzle',
    description: 'Place missing pieces to complete the image.',
    skill: 'focus',
    iconColors: { bg: 'bg-red-500/20', icon: 'text-red-500' },
    dbGameTypeId: 'image_puzzle',
  },
  draw_me: {
    id: 'draw_me',
    name: 'Draw Me',
    description: 'Copy the reference path. 3 rounds of increasing difficulty.',
    skill: 'pattern',
    iconColors: { bg: 'bg-green-500/20', icon: 'text-green-500' },
    dbGameTypeId: 'draw_me',
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
