// A deck-builder turn loop: draw, play, discard, reshuffle, and save mid-game.
import { luck } from 'luckbox'

const CARDS = ['Strike', 'Strike', 'Strike', 'Defend', 'Defend', 'Bash', 'Fireball', 'Heal', 'Draw 2', 'Strike']
const rng = luck('card-run')
const deck = rng.deck(CARDS)

for (let turn = 1; turn <= 3; turn++) {
  const hand = deck.drawMany(5)
  console.log(`Turn ${turn}: drew ${hand.join(', ')}  (draw pile ${deck.drawPile.length}, discard ${deck.discardPile.length})`)
  deck.discardHand() // played everything; when the draw pile runs out the discards are reshuffled in
}

// Save mid-game and continue on another device.
const save = JSON.stringify({ rng: rng.state(), deck: deck.state() })
const loaded = JSON.parse(save)
const deck2 = luck.from(loaded.rng).deck(CARDS, { state: loaded.deck })
console.log(`After loading, turn 4 draws: ${deck2.drawMany(5).join(', ')}`)
console.log(`Without saving, turn 4 draws: ${deck.drawMany(5).join(', ')}`)
