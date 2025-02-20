export interface CompareObjectsWithExistingKeysCase {
  input: {
    obj1: object
    obj2: object
  }
  expected: Record<string, [any, any]> | null
}

export const compareObjectsWithExistingKeysCases: CompareObjectsWithExistingKeysCase[] = [
  {
    input: {
      obj1: { a: 1, b: { c: 2, d: 3 } },
      obj2: { a: 1, b: { c: 2, d: 4 } },
    },
    expected: { 'b.d': [4, 3] },
  },
  {
    input: {
      obj1: { a: 1, b: 2 },
      obj2: { a: 1, b: 3 },
    },
    expected: { b: [3, 2] },
  },
  {
    input: {
      obj1: { a: { b: { c: 1 } } },
      obj2: { a: { b: { c: 2 } } },
    },
    expected: { 'a.b.c': [2, 1] },
  },
  {
    input: {
      obj1: { a: 1, b: 2 },
      obj2: { a: 1, b: 2 },
    },
    expected: null,
  },
]
