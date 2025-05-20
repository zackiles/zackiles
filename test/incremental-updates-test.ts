import { exists } from '@std/fs'

interface StateWithHistory {
  lastUpdated: string
  counter: number
  history: Array<{
    date: string
    value: number
  }>
}

// Basic state management functions
async function saveState(state: StateWithHistory, path: string): Promise<void> {
  // Always update the lastUpdated field
  const updatedState = {
    ...state,
    lastUpdated: new Date().toISOString(),
  }
  await Deno.writeTextFile(path, JSON.stringify(updatedState, null, 2))
  console.log(`State saved to ${path}`)
}

async function loadState(path: string): Promise<StateWithHistory | null> {
  try {
    if (await exists(path)) {
      const content = await Deno.readTextFile(path)
      return JSON.parse(content) as StateWithHistory
    }
  } catch (error) {
    console.error(`Error loading state from ${path}:`, error)
  }
  return null
}

// Sample function that uses state to incrementally update data
async function incrementalUpdate(statePath: string): Promise<StateWithHistory> {
  // Load existing state or create a default one if none exists
  const currentState = await loadState(statePath) || {
    lastUpdated: new Date(0).toISOString(),
    counter: 0,
    history: [],
  }

  // Get the last update time
  const lastUpdateTime = new Date(currentState.lastUpdated)

  // In a real scenario, you would fetch only data since the last update
  console.log(`Fetching data since: ${lastUpdateTime.toISOString()}`)

  // Simulate new data being added
  const newEntry = {
    date: new Date().toISOString(),
    value: Math.floor(Math.random() * 100),
  }

  // Update the state incrementally
  const updatedState = {
    ...currentState,
    counter: currentState.counter + 1,
    history: [...currentState.history, newEntry],
  }

  // Save the updated state
  await saveState(updatedState, statePath)

  return updatedState
}

// Test the incremental update process
Deno.test('Incremental State Updates', async () => {
  const TEST_STATE_FILE = './test_incremental_state.json'

  try {
    // Clean up any existing test file
    try {
      await Deno.remove(TEST_STATE_FILE)
    } catch {
      // Ignore errors if file doesn't exist
    }

    // First run - should create initial state
    console.log('First run - Create initial state')
    const firstState = await incrementalUpdate(TEST_STATE_FILE)

    // Verify the state was created correctly
    if (firstState.counter !== 1) {
      throw new Error(`Expected counter to be 1, got ${firstState.counter}`)
    }

    if (firstState.history.length !== 1) {
      throw new Error(`Expected history to have 1 entry, got ${firstState.history.length}`)
    }

    // Wait a short time to ensure timestamps differ
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Second run - should incrementally update the state
    console.log('Second run - Incremental update')
    const secondState = await incrementalUpdate(TEST_STATE_FILE)

    // Verify the state was updated correctly
    if (secondState.counter !== 2) {
      throw new Error(`Expected counter to be 2, got ${secondState.counter}`)
    }

    if (secondState.history.length !== 2) {
      throw new Error(`Expected history to have 2 entries, got ${secondState.history.length}`)
    }

    // Verify that the original history entry was preserved
    if (secondState.history[0].date !== firstState.history[0].date) {
      throw new Error('Original history entry was not preserved')
    }

    // Wait a short time to ensure timestamps differ
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Third run - another incremental update
    console.log('Third run - Another incremental update')
    const thirdState = await incrementalUpdate(TEST_STATE_FILE)

    // Verify the state was updated correctly
    if (thirdState.counter !== 3) {
      throw new Error(`Expected counter to be 3, got ${thirdState.counter}`)
    }

    if (thirdState.history.length !== 3) {
      throw new Error(`Expected history to have 3 entries, got ${thirdState.history.length}`)
    }

    // Verify that all previous history entries were preserved
    if (
      thirdState.history[0].date !== firstState.history[0].date ||
      thirdState.history[1].date !== secondState.history[1].date
    ) {
      throw new Error('Previous history entries were not preserved')
    }

    console.log('Test passed - Incremental updates work correctly')
    console.log('Final state:', JSON.stringify(thirdState, null, 2))
  } finally {
    // Clean up
    try {
      await Deno.remove(TEST_STATE_FILE)
    } catch {
      // Ignore errors
    }
  }
})
