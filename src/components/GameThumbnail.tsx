interface GameThumbnailProps {
  gameId: string
  isPlayable: boolean
}

export function GameThumbnail({ gameId, isPlayable }: GameThumbnailProps) {
  const opacity = isPlayable ? '' : 'opacity-50 grayscale'

  return (
    <div className={`w-full rounded-lg overflow-hidden ${opacity}`}>
      <svg viewBox="0 0 480 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block">
        {renderGame(gameId)}
      </svg>
    </div>
  )
}

function renderGame(gameId: string) {
  switch (gameId) {
    case 'reaction_time': return <ReactionTime />
    case 'emoji_keypad': return <EmojiKeypad />
    case 'audio_pattern': return <AudioPattern />
    case 'whack_a_mole': return <WhackAMole />
    case 'typing_speed': return <TypingSpeed />
    case 'mental_math': return <MentalMath />
    case 'color_match': return <ColorMatch />
    case 'visual_diff': return <VisualDiff />
    case 'follow_me': return <FollowMe />
    case 'drag_sort': return <DragSort />
    case 'duck_shoot': return <DuckShoot />
    case 'memory_cards': return <MemoryCards />
    case 'number_chain': return <NumberChain />
    case 'image_rotate': return <ImageRotate />
    case 'gridlock': return <Gridlock />
    case 'reaction_bars': return <ReactionBars />
    case 'image_puzzle': return <ImagePuzzle />
    case 'draw_me': return <DrawMe />
    default: return <DefaultThumb />
  }
}

/* ═══ REFLEX SKILL — yellow ═══ */

/* ─── Reaction Time ─── */
function ReactionTime() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-yellow-100 dark:fill-yellow-900/20" />
      <circle cx="240" cy="100" r="70" className="fill-yellow-300/30 dark:fill-yellow-500/15" />
      <path d="M252,30 L222,105 L244,105 L228,170 L268,88 L246,88 Z" className="fill-yellow-400" />
      <path d="M252,30 L222,105 L244,105 L228,170 L268,88 L246,88 Z" fill="none" strokeWidth="3" strokeLinejoin="round" className="stroke-yellow-500" />
      {/* Green pill left */}
      <rect x="60" y="70" width="70" height="28" rx="14" className="fill-green-400/80" />
      <rect x="72" y="79" width="12" height="10" rx="3" className="fill-white/60" />
      <rect x="90" y="79" width="26" height="10" rx="3" className="fill-white/40" />
      {/* Red pill right */}
      <rect x="350" y="70" width="70" height="28" rx="14" className="fill-red-400/80" />
      <rect x="362" y="79" width="12" height="10" rx="3" className="fill-white/60" />
      <rect x="380" y="79" width="26" height="10" rx="3" className="fill-white/40" />
      {/* Timer arcs */}
      <circle cx="100" cy="150" r="20" fill="none" strokeWidth="4" className="stroke-yellow-300/50" />
      <path d="M100 130 A20 20 0 0 1 120 150" fill="none" strokeWidth="4" className="stroke-yellow-500" />
      <circle cx="380" cy="150" r="20" fill="none" strokeWidth="4" className="stroke-yellow-300/50" />
      <path d="M380 130 A20 20 0 1 0 360 150" fill="none" strokeWidth="4" className="stroke-yellow-500" />
    </>
  )
}

/* ─── Whack-a-Mole ─── */
function WhackAMole() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-yellow-100 dark:fill-yellow-900/20" />
      <rect x="0" y="140" width="480" height="60" rx="0" className="fill-yellow-300/50 dark:fill-yellow-800/30" />
      {[120, 240, 360].map((cx, i) => (
        <g key={i}>
          <ellipse cx={cx} cy={155} rx="50" ry="16" className="fill-yellow-800/30 dark:fill-yellow-950/40" />
          {i === 1 && (
            <>
              <ellipse cx={cx} cy={120} rx="30" ry="32" className="fill-amber-700" />
              <ellipse cx={cx} cy={112} rx="24" ry="20" className="fill-amber-600" />
              <circle cx={cx - 8} cy={108} r="4" className="fill-white" />
              <circle cx={cx + 8} cy={108} r="4" className="fill-white" />
              <circle cx={cx - 7} cy={109} r="2" className="fill-slate-800" />
              <circle cx={cx + 9} cy={109} r="2" className="fill-slate-800" />
              <ellipse cx={cx} cy={118} rx="5" ry="3" className="fill-amber-800" />
            </>
          )}
        </g>
      ))}
      <rect x="330" y="30" width="16" height="60" rx="3" transform="rotate(-30 338 60)" className="fill-amber-800" />
      <rect x="315" y="20" width="46" height="24" rx="6" transform="rotate(-30 338 32)" className="fill-slate-400 dark:fill-slate-500" />
    </>
  )
}

/* ─── Target Shoot (duck_shoot) ─── */
function DuckShoot() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-yellow-100 dark:fill-yellow-900/20" />
      <circle cx="240" cy="100" r="70" className="fill-white/60 dark:fill-slate-700/40" />
      <circle cx="240" cy="100" r="55" className="fill-red-200/60 dark:fill-red-900/30" />
      <circle cx="240" cy="100" r="40" className="fill-white/60 dark:fill-slate-700/40" />
      <circle cx="240" cy="100" r="25" className="fill-red-300/70 dark:fill-red-800/40" />
      <circle cx="240" cy="100" r="10" className="fill-red-500" />
      <line x1="240" y1="20" x2="240" y2="180" strokeWidth="1.5" className="stroke-slate-400/50 dark:stroke-slate-500/50" />
      <line x1="160" y1="100" x2="320" y2="100" strokeWidth="1.5" className="stroke-slate-400/50 dark:stroke-slate-500/50" />
      <circle cx="240" cy="100" r="75" fill="none" strokeWidth="2" className="stroke-slate-400/40 dark:stroke-slate-500/40" />
      <circle cx="390" cy="60" r="16" className="fill-green-300/50 dark:fill-green-700/30" />
      <circle cx="390" cy="60" r="8" className="fill-green-400/70" />
    </>
  )
}

/* ─── Reaction Bars ─── */
function ReactionBars() {
  const colors = ['fill-red-400', 'fill-blue-400', 'fill-amber-400']
  const widths = [65, 45, 75]
  const targets = [50, 60, 40]
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-yellow-100 dark:fill-yellow-900/20" />
      {[0, 1, 2].map(i => {
        const y = 30 + i * 55
        const barWidth = widths[i] * 3.2
        const targetX = 60 + targets[i] * 3.2
        return (
          <g key={i}>
            <rect x="60" y={y} width="320" height="32" rx="6" className="fill-slate-300/50 dark:fill-slate-600/30" />
            <rect x="60" y={y} width={barWidth} height="32" rx="6" className={colors[i]} opacity={0.7} />
            <line x1={targetX} y1={y - 4} x2={targetX} y2={y + 36} strokeWidth="2" strokeDasharray="4 3" className="stroke-white/80" />
            <circle cx={targetX} cy={y + 16} r="4" className="fill-white/90" />
          </g>
        )
      })}
      <circle cx="430" cy="100" r="25" fill="none" strokeWidth="3" className="stroke-yellow-400/50" />
      <line x1="430" y1="100" x2="445" y2="85" strokeWidth="3" strokeLinecap="round" className="stroke-yellow-500" />
    </>
  )
}

/* ═══ LOGIC SKILL — blue ═══ */

/* ─── Image Rotate ─── */
function ImageRotate() {
  const tileColors = [
    'fill-blue-300/60', 'fill-blue-400/50', 'fill-blue-200/60',
    'fill-blue-400/40', 'fill-blue-300/60', 'fill-blue-200/50',
    'fill-blue-300/50', 'fill-blue-200/50', 'fill-blue-400/60',
  ]
  const rotatedIdx = 4
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-blue-100 dark:fill-blue-900/20" />
      {[0, 1, 2].map(row =>
        [0, 1, 2].map(col => {
          const idx = row * 3 + col
          const x = 165 + col * 54
          const y = 17 + row * 56
          const cx = x + 24
          const cy = y + 25
          return (
            <rect
              key={`${row}-${col}`}
              x={x} y={y} width="48" height="50" rx="6"
              className={tileColors[idx]}
              transform={idx === rotatedIdx ? `rotate(20 ${cx} ${cy})` : undefined}
            />
          )
        })
      )}
      <g transform="translate(385, 100)">
        <path d="M0,-30 A30,30 0 1,1 -25,15" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-blue-500" />
        <polygon points="-30,10 -20,22 -16,6" className="fill-blue-500" />
      </g>
    </>
  )
}

/* ─── Mental Math ─── */
function MentalMath() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-blue-100 dark:fill-blue-900/20" />
      <rect x="90" y="60" width="70" height="70" rx="12" className="fill-blue-300 dark:fill-blue-700/60" />
      <rect x="103" y="82" width="44" height="8" rx="2" className="fill-white/70" />
      <rect x="115" y="96" width="20" height="8" rx="2" className="fill-white/50" />
      <rect x="187" y="90" width="26" height="6" rx="3" className="fill-blue-500" />
      <rect x="197" y="80" width="6" height="26" rx="3" className="fill-blue-500" />
      <rect x="240" y="60" width="70" height="70" rx="12" className="fill-blue-300 dark:fill-blue-700/60" />
      <rect x="253" y="82" width="44" height="8" rx="2" className="fill-white/70" />
      <rect x="265" y="96" width="20" height="8" rx="2" className="fill-white/50" />
      <rect x="335" y="85" width="26" height="6" rx="3" className="fill-blue-500" />
      <rect x="335" y="97" width="26" height="6" rx="3" className="fill-blue-500" />
      <rect x="385" y="68" width="50" height="50" rx="10" className="fill-blue-200/50 dark:fill-blue-800/30" strokeWidth="2" strokeDasharray="6 4" fill="none" />
      <rect x="385" y="68" width="50" height="50" rx="10" className="fill-blue-200/50 dark:fill-blue-800/30" />
      <rect x="398" y="88" width="24" height="8" rx="2" className="fill-blue-400/40" />
    </>
  )
}

/* ─── Drag Sort ─── */
function DragSort() {
  const widths = [180, 140, 220, 100, 200]
  const yPositions = [20, 56, 92, 128, 164]
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-blue-100 dark:fill-blue-900/20" />
      {widths.map((w, i) => {
        const displaced = i === 2
        const xOff = displaced ? 8 : 0
        const yOff = displaced ? -6 : 0
        return (
          <g key={i}>
            <rect
              x={140 - xOff} y={yPositions[i] + yOff} width={w} height="28" rx="6"
              className={displaced ? 'fill-blue-400' : 'fill-slate-300 dark:fill-slate-600'}
            />
            {[0, 8, 16].map(dy => (
              <g key={dy}>
                <circle cx={150 - xOff} cy={yPositions[i] + yOff + 8 + dy} r="2" className={displaced ? 'fill-blue-700/50' : 'fill-slate-400/50 dark:fill-slate-500/50'} />
                <circle cx={157 - xOff} cy={yPositions[i] + yOff + 8 + dy} r="2" className={displaced ? 'fill-blue-700/50' : 'fill-slate-400/50 dark:fill-slate-500/50'} />
              </g>
            ))}
          </g>
        )
      })}
      <rect x="144" y="90" width="220" height="28" rx="6" className="fill-black/5 dark:fill-black/10" />
    </>
  )
}

/* ─── Number Chain ─── */
function NumberChain() {
  const positions = [
    [100, 50], [180, 40], [260, 70], [330, 45], [380, 100],
    [320, 140], [240, 155], [160, 140], [100, 120]
  ] as const
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-blue-100 dark:fill-blue-900/20" />
      {positions.slice(0, -1).map(([x1, y1], i) => {
        const [x2, y2] = positions[i + 1]
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="3" className="stroke-blue-300/50 dark:stroke-blue-700/30" />
        )
      })}
      {positions.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="20" className={i < 4 ? 'fill-blue-400' : 'fill-slate-300 dark:fill-slate-600'} />
          <rect x={cx - 8} y={cy - 2} width="16" height="4" rx="2" className="fill-white/60" />
        </g>
      ))}
    </>
  )
}

/* ═══ FOCUS SKILL — red ═══ */

/* ─── Color Match ─── */
function ColorMatch() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-red-100 dark:fill-red-900/20" />
      {/* RGB circles — game mechanic colors */}
      <circle cx="220" cy="80" r="50" opacity="0.5" className="fill-red-400" />
      <circle cx="260" cy="80" r="50" opacity="0.5" className="fill-blue-400" />
      <circle cx="240" cy="115" r="50" opacity="0.5" className="fill-green-400" />
      <rect x="120" y="172" width="240" height="6" rx="3" className="fill-slate-300/50 dark:fill-slate-600/50" />
      <circle cx="200" cy="175" r="8" className="fill-red-400" />
      <rect x="120" y="186" width="240" height="6" rx="3" className="fill-slate-300/50 dark:fill-slate-600/50" />
      <circle cx="280" cy="189" r="8" className="fill-green-400" />
    </>
  )
}

/* ─── Visual Diff ─── */
function VisualDiff() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-red-100 dark:fill-red-900/20" />
      <rect x="30" y="20" width="195" height="160" rx="8" className="fill-white/50 dark:fill-slate-700/40" />
      <rect x="255" y="20" width="195" height="160" rx="8" className="fill-white/50 dark:fill-slate-700/40" />
      <rect x="234" y="30" width="12" height="140" rx="2" className="fill-red-300/40 dark:fill-red-700/30" />
      {/* Left shapes */}
      <circle cx="80" cy="70" r="18" className="fill-red-400/70" />
      <rect x="130" y="55" width="30" height="30" rx="4" className="fill-red-300/70" />
      <polygon points="100,130 85,160 115,160" className="fill-red-400/50" />
      <circle cx="170" cy="140" r="14" className="fill-red-300/60" />
      {/* Right shapes — one different */}
      <circle cx="305" cy="70" r="18" className="fill-red-400/70" />
      <rect x="355" y="55" width="30" height="30" rx="4" className="fill-red-300/70" />
      <polygon points="325,130 310,160 340,160" className="fill-red-400/50" />
      <circle cx="395" cy="140" r="14" className="fill-amber-400/70" />
      <circle cx="395" cy="140" r="20" fill="none" strokeWidth="2" strokeDasharray="4 3" className="stroke-amber-500/60" />
    </>
  )
}

/* ─── Gridlock ─── */
function Gridlock() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-red-100 dark:fill-red-900/20" />
      <rect x="140" y="15" width="200" height="170" rx="8" className="fill-slate-200/60 dark:fill-slate-700/40" />
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <line x1={140} y1={15 + i * 42.5} x2={340} y2={15 + i * 42.5} strokeWidth="1" className="stroke-slate-300/50 dark:stroke-slate-600/50" />
          <line x1={140 + i * 50} y1={15} x2={140 + i * 50} y2={185} strokeWidth="1" className="stroke-slate-300/50 dark:stroke-slate-600/50" />
        </g>
      ))}
      {/* Green block to free */}
      <rect x="145" y="62" width="95" height="36" rx="6" className="fill-green-400" />
      {/* Obstacle blocks */}
      <rect x="245" y="20" width="40" height="120" rx="6" className="fill-blue-400" />
      <rect x="145" y="105" width="45" height="36" rx="6" className="fill-orange-400" />
      <rect x="195" y="145" width="90" height="36" rx="6" className="fill-red-400" />
      {/* Exit gap */}
      <rect x="336" y="62" width="14" height="36" rx="2" className="fill-red-100 dark:fill-red-900/20" />
      <polygon points="355,80 370,80 362,70" transform="rotate(90 362 80)" className="fill-green-400/60" />
    </>
  )
}

/* ─── Image Puzzle ─── */
function ImagePuzzle() {
  const placed = [0, 4, 8]
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-red-100 dark:fill-red-900/20" />
      {[0, 1, 2].map(row =>
        [0, 1, 2].map(col => {
          const idx = row * 3 + col
          const x = 165 + col * 54
          const y = 17 + row * 56
          const isPlaced = placed.includes(idx)
          return (
            <g key={`${row}-${col}`}>
              <rect
                x={x} y={y} width="48" height="50" rx="6"
                className={isPlaced ? 'fill-red-300/60' : 'fill-slate-300/40 dark:fill-slate-600/40'}
                strokeWidth={isPlaced ? 0 : 2}
                strokeDasharray={isPlaced ? undefined : '4 3'}
                stroke={isPlaced ? undefined : undefined}
              />
              {!isPlaced && (
                <>
                  <line x1={x + 5} y1={y + 5} x2={x + 43} y2={y + 45} strokeWidth="1" className="stroke-slate-400/30" />
                  <text x={x + 24} y={y + 30} textAnchor="middle" className="fill-slate-400/60" fontSize="18" fontWeight="bold">?</text>
                </>
              )}
              {isPlaced && (
                <rect x={x + 8} y={y + 8} width="32" height="34" rx="4" className="fill-red-400/40" />
              )}
            </g>
          )
        })
      )}
    </>
  )
}

/* ═══ MEMORY SKILL — purple ═══ */

/* ─── Emoji Keypad ─── */
function EmojiKeypad() {
  const colors = ['fill-purple-400', 'fill-purple-300', 'fill-purple-500', 'fill-purple-300/80',
    'fill-purple-400/70', 'fill-purple-500', 'fill-purple-300', 'fill-purple-400',
    'fill-purple-400/60', 'fill-purple-500/80', 'fill-purple-300/70', 'fill-purple-400/80']
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-purple-100 dark:fill-purple-900/20" />
      {[0, 1, 2, 3].map(row =>
        [0, 1, 2].map(col => (
          <rect
            key={`${row}-${col}`}
            x={155 + col * 60} y={15 + row * 45} width="48" height="36" rx="8"
            className={colors[row * 3 + col]}
          />
        ))
      )}
      <rect x="155" y="15" width="48" height="36" rx="8" fill="none" strokeWidth="3" className="stroke-white/60" />
    </>
  )
}

/* ─── Follow Me ─── */
function FollowMe() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-red-100 dark:fill-red-900/20" />
      <path
        d="M80,160 C120,40 200,180 240,80 S360,160 400,60"
        fill="none" strokeWidth="4" strokeDasharray="8 4"
        className="stroke-red-300 dark:stroke-red-700"
      />
      {[
        [80, 160], [130, 85], [180, 140], [240, 80], [300, 120], [350, 130], [400, 60]
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 0 || i === 6 ? 8 : 5}
          className={i === 0 ? 'fill-green-400' : i === 6 ? 'fill-red-500' : 'fill-red-400/60'}
        />
      ))}
      <g transform="translate(240,78) rotate(-45)">
        <rect x="-3" y="-16" width="6" height="20" rx="1" className="fill-red-500" />
        <polygon points="-3,4 3,4 0,10" className="fill-red-700" />
      </g>
    </>
  )
}

/* ─── Memory Cards ─── */
function MemoryCards() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-purple-100 dark:fill-purple-900/20" />
      {/* Card 1 — face down */}
      <rect x="50" y="30" width="80" height="130" rx="10" className="fill-purple-300 dark:fill-purple-700/60" />
      <rect x="59" y="39" width="62" height="112" rx="6" className="fill-purple-400/40 dark:fill-purple-600/30" />
      <circle cx="90" cy="80" r="12" fill="none" strokeWidth="3.5" className="stroke-white/50" />
      <rect x="88" y="94" width="4" height="9" rx="2" className="fill-white/50" />
      <circle cx="90" cy="108" r="2.5" className="fill-white/50" />
      {/* Card 2 — face down */}
      <rect x="145" y="30" width="80" height="130" rx="10" className="fill-purple-300 dark:fill-purple-700/60" />
      <rect x="154" y="39" width="62" height="112" rx="6" className="fill-purple-400/40 dark:fill-purple-600/30" />
      <circle cx="185" cy="80" r="12" fill="none" strokeWidth="3.5" className="stroke-white/50" />
      <rect x="183" y="94" width="4" height="9" rx="2" className="fill-white/50" />
      <circle cx="185" cy="108" r="2.5" className="fill-white/50" />
      {/* Card 3 — revealed (star) */}
      <rect x="255" y="30" width="80" height="130" rx="10" className="fill-white/80 dark:fill-slate-600/60" />
      <polygon
        points="295,55 301,76 323,76 305,89 312,110 295,98 278,110 285,89 267,76 289,76"
        className="fill-purple-400"
      />
      {/* Card 4 — revealed (matching star) */}
      <rect x="350" y="30" width="80" height="130" rx="10" className="fill-white/80 dark:fill-slate-600/60" />
      <polygon
        points="390,55 396,76 418,76 400,89 407,110 390,98 373,110 380,89 362,76 384,76"
        className="fill-purple-400"
      />
    </>
  )
}

/* ═══ PATTERN SKILL — green ═══ */

/* ─── Typing Speed ─── */
function TypingSpeed() {
  const row1 = [0, 40, 80, 120, 160, 200, 240, 280, 320, 340]
  const row2 = [20, 60, 100, 140, 180, 220, 260, 300, 330]
  const row3 = [50, 90, 130, 170, 210, 250, 290]
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-green-100 dark:fill-green-900/20" />
      {row1.map((x, i) => (
        <rect key={`r1-${i}`} x={55 + x} y={45} width="32" height="28" rx="4" className="fill-slate-300 dark:fill-slate-600" />
      ))}
      {row2.map((x, i) => (
        <rect key={`r2-${i}`} x={55 + x} y={82} width="32" height="28" rx="4" className="fill-slate-300 dark:fill-slate-600" />
      ))}
      {row3.map((x, i) => (
        <rect key={`r3-${i}`} x={55 + x} y={119} width="32" height="28" rx="4" className="fill-slate-300 dark:fill-slate-600" />
      ))}
      <rect x="145" y="156" width="190" height="24" rx="4" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="175" y="82" width="32" height="28" rx="4" className="fill-green-400" />
      <rect x="340" y="15" width="2" height="18" rx="1" className="fill-green-500" />
      <rect x="80" y="15" width="140" height="6" rx="3" className="fill-green-300/60" />
      <rect x="230" y="15" width="100" height="6" rx="3" className="fill-slate-300/40 dark:fill-slate-600/40" />
    </>
  )
}

/* ─── Audio Pattern (Simon Says) ─── */
function AudioPattern() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-green-100 dark:fill-green-900/20" />
      {/* Simon buttons — game mechanic colors */}
      <rect x="170" y="25" width="68" height="68" rx="16" className="fill-red-400" />
      <rect x="242" y="25" width="68" height="68" rx="16" className="fill-green-400" />
      <rect x="170" y="97" width="68" height="68" rx="16" className="fill-blue-400" />
      <rect x="242" y="97" width="68" height="68" rx="16" className="fill-yellow-400" />
      <rect x="242" y="25" width="68" height="68" rx="16" className="fill-green-200/40" />
      {/* Sound waves */}
      <path d="M100 80 Q90 100 100 120" fill="none" strokeWidth="3" className="stroke-green-400/60" />
      <path d="M90 70 Q75 100 90 130" fill="none" strokeWidth="3" className="stroke-green-400/40" />
      <path d="M380 80 Q390 100 380 120" fill="none" strokeWidth="3" className="stroke-green-400/60" />
      <path d="M390 70 Q405 100 390 130" fill="none" strokeWidth="3" className="stroke-green-400/40" />
    </>
  )
}

/* ─── Draw Me ─── */
function DrawMe() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-green-100 dark:fill-green-900/20" />
      {/* Left panel: draw area */}
      <rect x="30" y="20" width="190" height="160" rx="8" className="fill-slate-100/60 dark:fill-slate-800/30" />
      <path d="M60,140 Q100,50 150,95 T190,55" fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 4" className="stroke-green-400" />
      <circle cx="60" cy="140" r="5" className="fill-green-400/40" />
      <circle cx="190" cy="55" r="5" className="fill-red-400/40" />
      <text x="125" y="175" textAnchor="middle" className="fill-slate-400/80" fontSize="10" fontWeight="bold">DRAW HERE</text>
      {/* Right panel: reference */}
      <rect x="260" y="20" width="190" height="160" rx="8" className="fill-slate-200/60 dark:fill-slate-700/30" />
      <path d="M290,140 Q330,40 380,90 T420,50" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-green-600" />
      <circle cx="290" cy="140" r="6" className="fill-green-500" />
      <circle cx="420" cy="50" r="6" className="fill-red-500" />
      <text x="355" y="175" textAnchor="middle" className="fill-slate-400/80" fontSize="10" fontWeight="bold">REFERENCE</text>
    </>
  )
}

/* ─── Default fallback ─── */
function DefaultThumb() {
  return (
    <>
      <rect width="480" height="200" rx="8" className="fill-slate-200 dark:fill-slate-800" />
      <circle cx="240" cy="100" r="40" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="225" y="85" width="30" height="30" rx="4" className="fill-slate-400/50 dark:fill-slate-500/50" />
    </>
  )
}
