// A 25% crit chance two ways: plain chance has long unlucky streaks that feel
// broken; fairChance keeps the same average without them.
import { luck } from 'luckbox'

function longestDryRun(roll, attacks = 100_000) {
  let hits = 0
  let streak = 0
  let worst = 0
  for (let i = 0; i < attacks; i++) {
    if (roll()) {
      hits++
      streak = 0
    } else worst = Math.max(worst, ++streak)
  }
  return { rate: hits / attacks, worst }
}

const plain = luck('crits')
const crit = luck('crits').fairChance(0.25)
const a = longestDryRun(() => plain.chance(0.25))
const b = longestDryRun(() => crit.roll())
console.log(`plain chance(0.25): ${(a.rate * 100).toFixed(1)}% crits, longest run without one: ${a.worst} attacks`)
console.log(`fairChance(0.25):   ${(b.rate * 100).toFixed(1)}% crits, longest run without one: ${b.worst} attacks (never more than ${crit.worstCase - 1})`)
