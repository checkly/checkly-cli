export interface UniqValFromArrByKeyCase {
  input: {
    arr: any[]
    key: string
  }
  expected: any[]
}

export const uniqValFromArrByKeyCases: UniqValFromArrByKeyCase[] = [
  {
    input: {
      arr: [
        { value1: 'alert-channel', id: 1 },
        { value1: 'check', id: 2 },
        { value1: 'alert-channel', id: 3 },
      ],
      key: 'value1',
    },
    expected: ['alert-channel', 'check'],
  },
  {
    input: {
      arr: [
        { value2: 'A', value: 10 },
        { value2: 'B', value: 20 },
        { value2: 'A', value: 30 },
      ],
      key: 'value2',
    },
    expected: ['A', 'B'],
  },
  {
    input: {
      arr: [
        { value2: 'A', value: 10 },
        { value2: 'B', value: 20 },
        { value2: 'A', value: 30 },
      ],
      key: 'value',
    },
    expected: [10, 20, 30],
  },
]
