import { exists } from '@std/fs'

// Define simple state types for testing
interface TestState {
  lastUpdated: string
  testData: {
    value: number
    text: string
  }
}

// Simple state functions - no dependencies on the main module
async function saveTestState(state: TestState, path: string): Promise<void> {
  await Deno.writeTextFile(path, JSON.stringify(state, null, 2))
  console.log(`Test state saved to ${path}`)
}

async function loadTestState(path: string): Promise<TestState | null> {
  try {
    if (await exists(path)) {
      const content = await Deno.readTextFile(path)
      return JSON.parse(content) as TestState
    }
    return null
  } catch (error) {
    console.error('Error loading test state:', error)
    return null
  }
}

// Test basic state functionality
Deno.test('State Persistence - Basic Save and Load', async () => {
  const TEST_FILE = './test_state.json'

  // Clean up any existing test file
  try {
    await Deno.remove(TEST_FILE)
  } catch {
    // Ignore errors if file doesn't exist
  }

  // Create test state
  const initialState: TestState = {
    lastUpdated: new Date().toISOString(),
    testData: {
      value: 42,
      text: 'Hello, world!',
    },
  }

  // Save state
  await saveTestState(initialState, TEST_FILE)

  // Verify file exists
  if (!await exists(TEST_FILE)) {
    throw new Error(`Test file ${TEST_FILE} was not created`)
  }

  // Load state
  const loadedState = await loadTestState(TEST_FILE)

  if (loadedState === null) {
    throw new Error('Failed to load state')
  }

  // Verify values match
  if (loadedState.testData.value !== 42) {
    throw new Error(`Expected value 42, got ${loadedState.testData.value}`)
  }

  if (loadedState.testData.text !== 'Hello, world!') {
    throw new Error(`Expected text "Hello, world!", got "${loadedState.testData.text}"`)
  }

  console.log('Test passed - state saved and loaded correctly')

  // Clean up
  await Deno.remove(TEST_FILE)
})

// Basic test that verifies we can update state
Deno.test('State Persistence - Update State', async () => {
  const TEST_FILE = './test_state.json'

  // Clean up any existing test file
  try {
    await Deno.remove(TEST_FILE)
  } catch {
    // Ignore errors if file doesn't exist
  }

  // Step 1: Create and save initial state
  const initialState: TestState = {
    lastUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    testData: {
      value: 10,
      text: 'Initial state',
    },
  }

  await saveTestState(initialState, TEST_FILE)

  // Step 2: Load the state
  const loadedState = await loadTestState(TEST_FILE)

  if (loadedState === null) {
    throw new Error('Failed to load state')
  }

  // Step 3: Modify the state
  const updatedState: TestState = {
    ...loadedState,
    lastUpdated: new Date().toISOString(),
    testData: {
      ...loadedState.testData,
      value: loadedState.testData.value + 5,
      text: 'Updated state',
    },
  }

  // Step 4: Save the updated state
  await saveTestState(updatedState, TEST_FILE)

  // Step 5: Load the updated state
  const finalState = await loadTestState(TEST_FILE)

  if (finalState === null) {
    throw new Error('Failed to load final state')
  }

  // Step 6: Verify the state was updated correctly
  if (finalState.testData.value !== 15) {
    throw new Error(`Expected value 15, got ${finalState.testData.value}`)
  }

  if (finalState.testData.text !== 'Updated state') {
    throw new Error(`Expected text "Updated state", got "${finalState.testData.text}"`)
  }

  // Make sure the lastUpdated time changed
  const initialTime = new Date(initialState.lastUpdated).getTime()
  const finalTime = new Date(finalState.lastUpdated).getTime()

  if (finalTime <= initialTime) {
    throw new Error('Updated timestamp should be newer than initial timestamp')
  }

  console.log('Test passed - state updated correctly')

  // Clean up
  await Deno.remove(TEST_FILE)
})
