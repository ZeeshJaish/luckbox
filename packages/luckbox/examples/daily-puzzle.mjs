// A Wordle-style daily puzzle: every player in the world gets the same word
// today, a new one tomorrow, and any past day can be replayed.
import { luck } from 'luckbox'

const WORDS = ['crane', 'pixel', 'quest', 'magic', 'sword', 'dragon', 'tower', 'ember', 'frost', 'grove', 'lucky', 'chest']
const LAUNCH = '2026-11-01'

function puzzle(date) {
  const day = luck.daily({ salt: 'my-word-game', date })
  const number = Math.round((Date.parse(date) - Date.parse(LAUNCH)) / 86_400_000) + 1
  return { number, word: day.pick(WORDS), seed: day.seed }
}

for (const date of ['2026-11-26', '2026-11-27', '2026-11-28']) {
  const p = puzzle(date)
  console.log(`Puzzle #${p.number} (${date}): ${p.word.toUpperCase()}   seed ${p.seed}`)
}
// Today, in the player's own time zone with a 4 am reset:
const today = luck.daily({ salt: 'my-word-game', timeZone: 'Asia/Kolkata', resetHour: 4 })
console.log(`Today's seed for India, resetting at 4 am: ${today.seed}`)
