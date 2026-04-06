export const agenticCheckResult = {
  logicalId: 'homepage-health',
  sourceFile: 'src/__checks__/homepage.check.ts',
  sourceInfo: {
    checkRunId: 'ebefe140-29bf-4650-9e89-6e36a5c092ef',
    checkRunSuiteId: '2b938869-e38b-4599-b3b0-901aeea4bbef',
    sequenceId: 'd2ec2faa-a7de-4dc1-8b56-2f4ee9248dc6',
    ephemeral: true,
  },
  checkRunId: '702961fd-7e2c-45f0-97be-1aa9eabd4d82',
  checkType: 'AGENTIC',
  name: 'Homepage health',
  hasErrors: false,
  hasFailures: false,
  attempts: 1,
  startedAt: '2025-06-15T12:00:00.000Z',
  stoppedAt: '2025-06-15T12:00:12.000Z',
  responseTime: 12000,
  aborted: false,
  runLocation: 'us-east-1',
  // agentRuntime result translated from metadata by processCheckResult().
  agenticCheckResult: {
    summary: 'The homepage loaded successfully and all assertions passed.',
    prompt: 'Navigate to https://www.checklyhq.com and verify the homepage loads successfully.',
    assertions: [
      { condition: 'The homepage returns an HTTP 200 status', passed: true, actual: '200', expected: '200' },
      { condition: 'The page heading is "Checkly"', passed: true, actual: 'Checkly', expected: 'Checkly' },
    ],
    suggestions: [
      {
        summary: 'Also verify the pricing page loads',
        prompt: 'After the homepage loads, navigate to /pricing and confirm all plans are visible.',
        secrets: [],
        category: 'configuration',
      },
    ],
    steps: [
      { type: 'message', output: 'Starting the check.', timestamp: '2025-06-15T12:00:00.100Z', sequenceNumber: 1 },
      { type: 'tool_call', name: 'http_request', input: { method: 'GET', url: 'https://www.checklyhq.com' }, timestamp: '2025-06-15T12:00:00.200Z', sequenceNumber: 2 },
      { type: 'tool_result', name: 'http_request', output: '200 OK', timestamp: '2025-06-15T12:00:01.500Z', sequenceNumber: 3 },
      { type: 'message', output: 'Homepage loaded, verifying heading.', timestamp: '2025-06-15T12:00:01.600Z', sequenceNumber: 4 },
    ],
    errors: [],
  },
  // Generic fallback fields — the reporter also appends these after the
  // AGENTIC-specific sections, so they should remain inert here.
  logs: [],
  runError: undefined,
  scheduleError: undefined,
}

export const agenticCheckResultWithFailures = {
  ...agenticCheckResult,
  hasFailures: true,
  agenticCheckResult: {
    ...agenticCheckResult.agenticCheckResult,
    summary: 'The homepage did not return a 200 status.',
    assertions: [
      { condition: 'The homepage returns an HTTP 200 status', passed: false, actual: '503', expected: '200' },
    ],
    errors: [
      { error: { message: 'Request failed: 503 Service Unavailable' } },
    ],
  },
}
