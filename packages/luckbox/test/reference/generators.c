/*
 * Reference versions of luckbox's generators, written in C with native
 * unsigned 32-bit math, to prove the JavaScript versions match bit for bit.
 *
 * Regenerate the vectors (only needed if you add an algorithm):
 *   clang -O2 -std=c11 -o /tmp/lb-ref test/reference/generators.c && /tmp/lb-ref > test/reference/vectors.json
 */
#include <stdint.h>
#include <stdio.h>

static uint32_t rotl(uint32_t x, int k) { return (x << k) | (x >> (32 - k)); }

/* sfc32 as in PractRand: a, b, c, counter. */
static uint32_t sfc32(uint32_t s[4]) {
  uint32_t t = s[0] + s[1] + s[3]++;
  s[0] = s[1] ^ (s[1] >> 9);
  s[1] = s[2] + (s[2] << 3);
  s[2] = rotl(s[2], 21) + t;
  return t;
}

/* xoshiro128** 1.1 as published by Blackman and Vigna. */
static uint32_t xoshiro128ss(uint32_t s[4]) {
  uint32_t result = rotl(s[1] * 5, 7) * 9;
  uint32_t t = s[1] << 9;
  s[2] ^= s[0];
  s[3] ^= s[1];
  s[1] ^= s[2];
  s[0] ^= s[3];
  s[2] ^= t;
  s[3] = rotl(s[3], 11);
  return result;
}

/* Mulberry32 by Tommy Ettinger. */
static uint32_t mulberry32(uint32_t s[4]) {
  uint32_t z = (s[0] += 0x6D2B79F5u);
  z = (z ^ (z >> 15)) * (z | 1u);
  z ^= z + (z ^ (z >> 7)) * (z | 61u);
  return z ^ (z >> 14);
}

typedef uint32_t (*gen_fn)(uint32_t s[4]);

static const uint32_t starts[4][4] = {
  {1, 2, 3, 4},
  {0, 0, 0, 1},
  {0xdeadbeef, 0xcafebabe, 0x8badf00d, 0xfeedface},
  {0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff},
};

static void emit(const char *name, gen_fn fn, int last) {
  printf("  \"%s\": [\n", name);
  for (int i = 0; i < 4; i++) {
    uint32_t s[4] = {starts[i][0], starts[i][1], starts[i][2], starts[i][3]};
    printf("    { \"start\": [%u, %u, %u, %u], \"outputs\": [", s[0], s[1], s[2], s[3]);
    for (int n = 0; n < 64; n++) printf("%s%u", n ? ", " : "", fn(s));
    printf("], \"end\": [%u, %u, %u, %u] }%s\n", s[0], s[1], s[2], s[3], i < 3 ? "," : "");
  }
  printf("  ]%s\n", last ? "" : ",");
}

int main(void) {
  printf("{\n");
  emit("sfc32", sfc32, 0);
  emit("xoshiro128**", xoshiro128ss, 0);
  emit("mulberry32", mulberry32, 1);
  printf("}\n");
  return 0;
}
