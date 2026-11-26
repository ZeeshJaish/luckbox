import { describe, expect, it } from 'vitest'
import { type BagState, type DeckState, luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

const PIECES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

describe('rng.bag()', () => {
  it('gives every item exactly once per bag', () => {
    const bag = luck('tetris').bag(PIECES)
    for (let round = 0; round < 50; round++) {
      const seen = Array.from({ length: 7 }, () => bag.next())
      expect([...seen].sort()).toEqual([...PIECES].sort())
    }
  })

  it('puts in copies', () => {
    const bag = luck('copies').bag(['a', 'b'], { copies: 3 })
    expect(bag.size).toBe(6)
    const round = Array.from({ length: 6 }, () => bag.next()).sort()
    expect(round).toEqual(['a', 'a', 'a', 'b', 'b', 'b'])
  })

  it('counts what is left', () => {
    const bag = luck('left').bag([1, 2, 3])
    expect(bag.left).toBe(0) // fills on first use
    bag.next()
    expect(bag.left).toBe(2)
    bag.next()
    bag.next()
    expect(bag.left).toBe(0)
    bag.next()
    expect(bag.left).toBe(2)
  })

  it('peek shows what next() will give', () => {
    const bag = luck('peek').bag(PIECES)
    for (let i = 0; i < 30; i++) {
      const p = bag.peek()
      expect(bag.next()).toBe(p)
    }
  })

  it('noRepeat stops the same item twice in a row across refills', () => {
    const bag = luck('no-repeat').bag(['a', 'b', 'c'], { noRepeat: true })
    let prev = bag.next()
    for (let i = 0; i < 6_000; i++) {
      const x = bag.next()
      expect(x).not.toBe(prev)
      prev = x
    }
  })

  it('without noRepeat, a refill can repeat the last item', () => {
    const bag = luck('repeat').bag(['a', 'b', 'c'])
    let prev = bag.next()
    let repeats = 0
    for (let i = 0; i < 3_000; i++) {
      const x = bag.next()
      if (x === prev) repeats++
      prev = x
    }
    expect(repeats).toBeGreaterThan(0)
  })

  it('noRepeat copes when every item is the same', () => {
    const bag = luck('same').bag(['a'], { copies: 3, noRepeat: true })
    expect(Array.from({ length: 9 }, () => bag.next())).toEqual(new Array(9).fill('a'))
  })

  it('saves and continues exactly', () => {
    const rng = luck('save-bag')
    const bag = rng.bag(PIECES, { noRepeat: true })
    for (let i = 0; i < 10; i++) bag.next()
    const saved = JSON.parse(JSON.stringify({ rng: rng.state(), bag: bag.state() })) as { rng: never; bag: BagState }
    const expected = Array.from({ length: 30 }, () => bag.next())
    const rng2 = luck.from(saved.rng)
    const bag2 = rng2.bag(PIECES, { noRepeat: true, state: saved.bag })
    expect(Array.from({ length: 30 }, () => bag2.next())).toEqual(expected)
  })

  it('loads a save that has nothing drawn yet', () => {
    const bag = luck('x').bag(['a', 'b'], { state: { remaining: [1] } })
    expect(bag.left).toBe(1)
    expect(bag.next()).toBe('b')
  })

  it('explains bad input and bad saves', () => {
    const rng = luck('x')
    expectCode(() => rng.bag([]), 'EMPTY_LIST')
    expectCode(() => rng.bag(5 as unknown as string[]), 'BAD_ARGUMENT')
    expectCode(() => rng.bag(['a'], { copies: 0 }), 'BAD_ARGUMENT')
    expectCode(() => rng.bag(['a'], { copies: 1.5 }), 'BAD_ARGUMENT')
    expectCode(() => rng.bag(['a'], 'x' as unknown as object), 'BAD_ARGUMENT')
    expectCode(() => rng.bag(['a', 'b'], { state: null as unknown as BagState }), 'BAD_STATE')
    expectCode(() => rng.bag(['a', 'b'], { state: { remaining: [0, 0] } }), 'BAD_STATE')
    expectCode(() => rng.bag(['a', 'b'], { state: { remaining: [2] } }), 'BAD_STATE')
    expectCode(() => rng.bag(['a', 'b'], { state: { remaining: 'x' as unknown as number[] } }), 'BAD_STATE')
    expectCode(() => rng.bag(['a', 'b'], { state: { remaining: [], last: 5 } }), 'BAD_STATE')
  })
})

describe('rng.deck()', () => {
  const CARDS = ['A', 'K', 'Q', 'J', '10']

  it('without shuffling, draws in list order', () => {
    const deck = luck('d').deck(CARDS, { shuffle: false })
    expect(deck.drawMany(5)).toEqual(CARDS)
  })

  it('shuffles by default, keeping every card', () => {
    const deck = luck('d').deck(CARDS)
    expect(deck.size).toBe(5)
    const drawn = deck.drawMany(5)
    expect([...drawn].sort()).toEqual([...CARDS].sort())
    expect(deck.draw()).toBeUndefined()
  })

  it('tracks the draw pile, the hand and the discard pile', () => {
    const deck = luck('d').deck(CARDS, { shuffle: false })
    const [a, k] = deck.drawMany(2) as [string, string]
    expect(deck.hand).toEqual(['A', 'K'])
    expect(deck.drawPile).toEqual(['Q', 'J', '10'])
    deck.discard(a)
    expect(deck.hand).toEqual(['K'])
    expect(deck.discardPile).toEqual(['A'])
    deck.putBack(k, 'top')
    expect(deck.drawPile[0]).toBe('K')
    expect(deck.peek(2)).toEqual(['K', 'Q'])
    expect(deck.drawPile).toEqual(['K', 'Q', 'J', '10']) // peek draws nothing
  })

  it('puts cards back on top, at the bottom, or anywhere', () => {
    const deck = luck('d').deck(CARDS, { shuffle: false })
    const a = deck.draw() as string
    deck.putBack(a, 'bottom')
    expect(deck.drawPile.at(-1)).toBe('A')
    const k = deck.draw() as string
    deck.putBack(k, 'random')
    expect([...deck.drawPile].sort()).toEqual([...CARDS].sort())
    expectCode(() => deck.putBack('Q'), 'BAD_ARGUMENT') // not in hand
    deck.draw()
    expectCode(() => deck.putBack(deck.hand[0] as string, 'middle' as 'top'), 'BAD_ARGUMENT')
  })

  it('reshuffles the discards back in when the draw pile runs out', () => {
    const deck = luck('d').deck(['a', 'b', 'c'])
    deck.discard(...deck.drawMany(3))
    expect(deck.discardPile).toHaveLength(3)
    const next = deck.draw()
    expect(['a', 'b', 'c']).toContain(next)
    expect(deck.discardPile).toHaveLength(0)
    expect(deck.drawPile).toHaveLength(2)
  })

  it('autoReshuffle: false stops when the draw pile is empty', () => {
    const deck = luck('d').deck(['a', 'b'], { autoReshuffle: false })
    deck.discard(...deck.drawMany(2))
    expect(deck.draw()).toBeUndefined()
    expect(deck.drawMany(3)).toEqual([])
    deck.reshuffle()
    expect(deck.drawMany(5)).toHaveLength(2)
  })

  it('handles duplicate cards like a real deck', () => {
    const deck = luck('d').deck(['Strike', 'Strike', 'Defend'])
    const hand = deck.drawMany(3)
    deck.discard('Strike', 'Strike')
    expect(deck.hand).toEqual(['Defend'])
    expectCode(() => deck.discard('Strike'), 'BAD_ARGUMENT')
    deck.discardHand()
    expect(deck.hand).toEqual([])
    expect(deck.discardPile).toHaveLength(hand.length)
  })

  it('shuffle() mixes only the draw pile', () => {
    const deck = luck('d').deck(Array.from({ length: 20 }, (_, i) => i), { shuffle: false })
    deck.discard(...deck.drawMany(5))
    deck.shuffle()
    expect(deck.discardPile).toHaveLength(5)
    expect([...deck.drawPile].sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 5))
  })

  it('saves and continues exactly', () => {
    const rng = luck('save-deck')
    const deck = rng.deck(CARDS)
    deck.discard(...deck.drawMany(2))
    deck.draw()
    const saved = JSON.parse(JSON.stringify({ rng: rng.state(), deck: deck.state() })) as { rng: never; deck: DeckState }
    const expected = [deck.hand, deck.drawMany(10), deck.discardPile]
    const rng2 = luck.from(saved.rng)
    const deck2 = rng2.deck(CARDS, { state: saved.deck })
    expect([deck2.hand, deck2.drawMany(10), deck2.discardPile]).toEqual(expected)
  })

  it('explains bad input and bad saves', () => {
    const rng = luck('x')
    const good = (): DeckState => ({ drawPile: [0], discardPile: [1], hand: [2] })
    expect(() => rng.deck(['a', 'b', 'c'], { state: good() })).not.toThrow()
    expectCode(() => rng.deck([]), 'EMPTY_LIST')
    expectCode(() => rng.deck('abc' as unknown as string[]), 'BAD_ARGUMENT')
    expectCode(() => rng.deck(['a'], 5 as unknown as object), 'BAD_ARGUMENT')
    expectCode(() => rng.deck(['a', 'b', 'c'], { state: { ...good(), hand: [] } }), 'BAD_STATE')
    expectCode(() => rng.deck(['a', 'b', 'c'], { state: { ...good(), hand: [0] } }), 'BAD_STATE')
    expectCode(() => rng.deck(['a', 'b', 'c'], { state: { ...good(), hand: [3] } }), 'BAD_STATE')
    expectCode(() => rng.deck(['a', 'b', 'c'], { state: 'x' as unknown as DeckState }), 'BAD_STATE')
    const deck = rng.deck(['a'])
    expectCode(() => deck.drawMany(-1), 'BAD_ARGUMENT')
    expectCode(() => deck.peek(1.5), 'BAD_ARGUMENT')
  })
})
