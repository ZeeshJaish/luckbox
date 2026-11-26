import { LuckboxError, show } from './errors.ts'
import type { Rng } from './rng.ts'

function checkItems(items: unknown, method: string): unknown[] {
  if (items === null || typeof items !== 'object' || typeof (items as { length?: unknown }).length !== 'number') {
    throw new LuckboxError('BAD_ARGUMENT', `${method} needs a list (like an array), got ${show(items)}.`)
  }
  const list = Array.from(items as ArrayLike<unknown>)
  if (list.length === 0) throw new LuckboxError('EMPTY_LIST', `${method} got an empty list.`)
  return list
}

function badState(method: string, why: string): never {
  throw new LuckboxError('BAD_STATE', `${method}: this saved state can't be loaded: ${why}.`)
}

/** Checks a list of positions: whole numbers in range, none used twice. */
function checkIndexes(value: unknown, size: number, used: Set<number>, method: string, field: string): number[] {
  if (!Array.isArray(value)) badState(method, `"${field}" must be a list of positions`)
  for (const i of value as unknown[]) {
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= size) {
      badState(method, `"${field}" has ${show(i)}, which is not a position from 0 to ${size - 1}`)
    }
    if (used.has(i)) badState(method, `position ${i} appears twice`)
    used.add(i)
  }
  return [...(value as number[])]
}

// ---------------------------------------------------------------- Bag

/** Options for `rng.bag()`. */
export interface BagOptions {
  /** How many copies of each item go in the bag. Default: 1. */
  copies?: number
  /**
   * Never give the same item twice in a row when the bag refills, so the last
   * item of one bag is never the first of the next. Default: false.
   */
  noRepeat?: boolean
  /** A saved `bag.state()` to continue from. */
  state?: BagState
}

/** A bag's position, as plain JSON. */
export interface BagState {
  /** Positions of the items still in the bag; the last one comes out next. */
  remaining: number[]
  /** Position of the last item drawn, if any. */
  last?: number
}

/**
 * A shuffle bag: every item comes out once, in random order, then the bag
 * refills and reshuffles. Players get variety without streaks, like the
 * 7-piece bag in falling-block games.
 *
 * @example
 * const pieces = rng.bag(['I', 'O', 'T', 'S', 'Z', 'J', 'L'])
 * pieces.next() // 'T'
 */
export class Bag<T> {
  readonly #rng: Rng
  readonly #contents: T[]
  readonly #noRepeat: boolean
  #remaining: number[] = []
  #last: number | undefined

  /** @internal Use `rng.bag(items)`. */
  constructor(rng: Rng, items: ArrayLike<T>, options: BagOptions = {}) {
    const list = checkItems(items, 'bag()') as T[]
    if (options === null || typeof options !== 'object') {
      throw new LuckboxError('BAD_ARGUMENT', `bag(items, options) needs options like { copies: 2 }, got ${show(options)}.`)
    }
    const { copies = 1, noRepeat = false, state } = options
    if (!Number.isSafeInteger(copies) || copies < 1 || copies * list.length > 10_000_000) {
      throw new LuckboxError('BAD_ARGUMENT', `bag() copies must be a whole number of 1 or more, got ${show(copies)}.`)
    }
    this.#rng = rng
    this.#noRepeat = noRepeat === true
    this.#contents = []
    for (let c = 0; c < copies; c++) for (const item of list) this.#contents.push(item)
    if (state !== undefined) this.#load(state)
  }

  #load(state: BagState): void {
    if (state === null || typeof state !== 'object') badState('bag()', `expected an object, got ${show(state)}`)
    const size = this.#contents.length
    this.#remaining = checkIndexes(state.remaining, size, new Set(), 'bag()', 'remaining')
    if (state.last !== undefined) {
      if (!Number.isInteger(state.last) || state.last < 0 || state.last >= size) badState('bag()', `"last" must be a position from 0 to ${size - 1}`)
      this.#last = state.last
    }
  }

  #refill(): void {
    const order = this.#contents.map((_, i) => i)
    this.#rng.shuffleInPlace(order)
    const last = this.#last
    if (this.#noRepeat && last !== undefined && order.length > 1) {
      const top = order.length - 1
      const same = (i: number): boolean => Object.is(this.#contents[i], this.#contents[last])
      if (same(order[top] as number)) {
        const others: number[] = []
        for (let i = 0; i < top; i++) if (!same(order[i] as number)) others.push(i)
        if (others.length > 0) {
          const j = others[this.#rng.int(0, others.length - 1)] as number
          const tmp = order[top] as number
          order[top] = order[j] as number
          order[j] = tmp
        }
      }
    }
    this.#remaining = order
  }

  /**
   * Takes the next item out of the bag (refilling it when empty).
   * @example pieces.next() // 'L'
   */
  next(): T {
    if (this.#remaining.length === 0) this.#refill()
    const i = this.#remaining.pop() as number
    this.#last = i
    return this.#contents[i] as T
  }

  /**
   * The item `next()` would give, without taking it.
   * @example pieces.peek() // 'S' (the next piece preview)
   */
  peek(): T {
    if (this.#remaining.length === 0) this.#refill()
    return this.#contents[this.#remaining[this.#remaining.length - 1] as number] as T
  }

  /** How many items are left before the bag refills. */
  get left(): number {
    return this.#remaining.length
  }

  /** How many items a full bag holds. */
  get size(): number {
    return this.#contents.length
  }

  /**
   * The bag's position as plain JSON. Restore it with
   * `rng.bag(items, { state })`, after restoring the Rng itself.
   */
  state(): BagState {
    const state: BagState = { remaining: [...this.#remaining] }
    if (this.#last !== undefined) state.last = this.#last
    return state
  }
}

// ---------------------------------------------------------------- Deck

/** Options for `rng.deck()`. */
export interface DeckOptions {
  /** Shuffle the cards when the deck is made. Default: true. */
  shuffle?: boolean
  /** When the draw pile runs out, shuffle the discard pile back in. Default: true. */
  autoReshuffle?: boolean
  /** A saved `deck.state()` to continue from. */
  state?: DeckState
}

/** A deck's position, as plain JSON (positions in the original card list). */
export interface DeckState {
  /** The draw pile; the last one is the top card. */
  drawPile: number[]
  /** The discard pile; the last one was discarded most recently. */
  discardPile: number[]
  /** The cards drawn and not yet discarded or put back. */
  hand: number[]
}

/**
 * A deck of cards with a draw pile, a discard pile and a hand.
 *
 * @example
 * const deck = rng.deck(['Strike', 'Strike', 'Defend', 'Bash'])
 * const hand = deck.drawMany(3)
 * deck.discard(hand[0])
 * deck.reshuffle() // discards go back in and everything is shuffled
 */
export class Deck<T> {
  readonly #rng: Rng
  readonly #cards: T[]
  readonly #autoReshuffle: boolean
  #draw: number[]
  #discard: number[] = []
  #hand: number[] = []

  /** @internal Use `rng.deck(cards)`. */
  constructor(rng: Rng, cards: ArrayLike<T>, options: DeckOptions = {}) {
    this.#cards = checkItems(cards, 'deck()') as T[]
    if (options === null || typeof options !== 'object') {
      throw new LuckboxError('BAD_ARGUMENT', `deck(cards, options) needs options like { shuffle: false }, got ${show(options)}.`)
    }
    const { shuffle = true, autoReshuffle = true, state } = options
    this.#rng = rng
    this.#autoReshuffle = autoReshuffle !== false
    // Index 0 ends up at the bottom, so an unshuffled deck draws in list order.
    this.#draw = this.#cards.map((_, i) => this.#cards.length - 1 - i)
    if (state !== undefined) this.#load(state)
    else if (shuffle !== false) rng.shuffleInPlace(this.#draw)
  }

  #load(state: DeckState): void {
    if (state === null || typeof state !== 'object') badState('deck()', `expected an object, got ${show(state)}`)
    const size = this.#cards.length
    const used = new Set<number>()
    this.#draw = checkIndexes(state.drawPile, size, used, 'deck()', 'drawPile')
    this.#discard = checkIndexes(state.discardPile, size, used, 'deck()', 'discardPile')
    this.#hand = checkIndexes(state.hand, size, used, 'deck()', 'hand')
    if (used.size !== size) badState('deck()', `it has ${used.size} cards but the deck has ${size}`)
  }

  #fromHand(card: T, method: string): number {
    const at = this.#hand.findIndex((i) => Object.is(this.#cards[i], card))
    if (at === -1) {
      throw new LuckboxError('BAD_ARGUMENT', `${method}: ${show(card)} is not in the hand. Only drawn cards can be discarded or put back.`)
    }
    const [i] = this.#hand.splice(at, 1)
    return i as number
  }

  /**
   * Draws the top card into the hand. When the draw pile is empty it first
   * shuffles the discards back in (unless `autoReshuffle` is off).
   * Returns `undefined` if there is nothing left to draw.
   * @example const card = deck.draw()
   */
  draw(): T | undefined {
    const i = this.#drawIndex()
    return i === undefined ? undefined : (this.#cards[i] as T)
  }

  #drawIndex(): number | undefined {
    if (this.#draw.length === 0 && this.#autoReshuffle && this.#discard.length > 0) this.reshuffle()
    const i = this.#draw.pop()
    if (i !== undefined) this.#hand.push(i)
    return i
  }

  /**
   * Draws up to `count` cards (fewer if the deck runs out).
   * @example const hand = deck.drawMany(5)
   */
  drawMany(count: number): T[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `drawMany(count) needs a whole number of 0 or more, got ${show(count)}.`)
    }
    const out: T[] = []
    for (let n = 0; n < count; n++) {
      const i = this.#drawIndex()
      if (i === undefined) break
      out.push(this.#cards[i] as T)
    }
    return out
  }

  /**
   * Moves cards from the hand to the discard pile.
   * @example deck.discard(card)
   */
  discard(...cards: T[]): void {
    for (const card of cards) this.#discard.push(this.#fromHand(card, 'discard()'))
  }

  /** Moves every card in the hand to the discard pile. */
  discardHand(): void {
    this.#discard.push(...this.#hand)
    this.#hand = []
  }

  /**
   * Puts a card from the hand back into the draw pile.
   * @param where `'top'` (default), `'bottom'` or `'random'`
   * @example deck.putBack(card, 'bottom')
   */
  putBack(card: T, where: 'top' | 'bottom' | 'random' = 'top'): void {
    if (where !== 'top' && where !== 'bottom' && where !== 'random') {
      throw new LuckboxError('BAD_ARGUMENT', `putBack(card, where) needs 'top', 'bottom' or 'random', got ${show(where)}.`)
    }
    const i = this.#fromHand(card, 'putBack()')
    if (where === 'top') this.#draw.push(i)
    else if (where === 'bottom') this.#draw.unshift(i)
    else this.#draw.splice(this.#rng.int(0, this.#draw.length), 0, i)
  }

  /** Shuffles the discard pile back into the draw pile. */
  reshuffle(): void {
    this.#draw.push(...this.#discard)
    this.#discard = []
    this.#rng.shuffleInPlace(this.#draw)
  }

  /** Shuffles the draw pile only. */
  shuffle(): void {
    this.#rng.shuffleInPlace(this.#draw)
  }

  /**
   * The top `count` cards of the draw pile, without drawing them (top first).
   * @example deck.peek(3)
   */
  peek(count: number = 1): T[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `peek(count) needs a whole number of 0 or more, got ${show(count)}.`)
    }
    return this.#draw.slice(Math.max(0, this.#draw.length - count)).reverse().map((i) => this.#cards[i] as T)
  }

  /** The draw pile, top card first. */
  get drawPile(): T[] {
    return [...this.#draw].reverse().map((i) => this.#cards[i] as T)
  }

  /** The discard pile, most recent first. */
  get discardPile(): T[] {
    return [...this.#discard].reverse().map((i) => this.#cards[i] as T)
  }

  /** The cards in the hand, in the order drawn. */
  get hand(): T[] {
    return this.#hand.map((i) => this.#cards[i] as T)
  }

  /** How many cards the whole deck has. */
  get size(): number {
    return this.#cards.length
  }

  /**
   * The deck's position as plain JSON. Restore it with
   * `rng.deck(cards, { state })`, after restoring the Rng itself.
   */
  state(): DeckState {
    return { drawPile: [...this.#draw], discardPile: [...this.#discard], hand: [...this.#hand] }
  }
}
