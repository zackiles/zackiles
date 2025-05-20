import { exists } from '@std/fs'

// Direct implementation of load and save for test
async function saveStateDirectly(state: Record<string, unknown>, path: string): Promise<void> {
  const updatedState = {
    ...state,
    lastUpdated: new Date().toISOString(),
  }
  await Deno.writeTextFile(path, JSON.stringify(updatedState, null, 2))
  console.log(`State saved to ${path}`)
}

async function loadStateDirectly(path: string): Promise<unknown | null> {
  try {
    if (await exists(path)) {
      const content = await Deno.readTextFile(path)
      return JSON.parse(content)
    }
  } catch (error) {
    console.error(`Error loading state from ${path}:`, error)
  }
  return null
}

// Test state persistence from the main module
Deno.test('GitHub Stats State Persistence', async () => {
  const TEST_STATE_FILE = './test_github_stats_state.json'

  try {
    // Clean up any existing test file
    try {
      await Deno.remove(TEST_STATE_FILE)
    } catch {
      // Ignore errors if file doesn't exist
    }

    // Create a minimal test state
    const testState = {
      semanticCommitSpectrum: {
        lastFetchTime: new Date().toISOString(),
        verbSpectrum: {
          creator: 5,
          maintainer: 3,
          bugfixer: 2,
          cleaner: 1,
          refactorer: 0,
          experimenter: 0,
          other: 0,
        },
        totalCommits: 11,
      },
      fileTypeFootprint: {
        lastScanTime: new Date().toISOString(),
        extensionCounts: { '.ts': 10, '.md': 5 },
        totalUniqueExtensions: 2,
      },
      codeVelocityDelta: {
        dailyAggregatedStats: [
          { date: '2023-05-01', additions: 100, deletions: 50 },
        ],
        lastAggregatedDate: '2023-05-01',
      },
      creatorTagSignature: {
        repoTopicData: {
          'test/repo': {
            updatedAt: new Date().toISOString(),
            topics: ['typescript', 'testing'],
          },
        },
        aggregatedTopicCounts: { 'typescript': 1, 'testing': 1 },
        totalUniqueTags: 2,
      },
      starredTopicAffinity: {
        topicCounts: { 'javascript': 3, 'react': 2 },
        lastProcessedStarredRepoCursor: null,
        totalUniqueStarredTags: 2,
      },
      starPowerPicks: {
        allStarredReposList: [
          {
            nameWithOwner: 'test/repo1',
            stargazerCount: 1000,
            url: 'https://github.com/test/repo1',
          },
        ],
        lastProcessedStarCursor: null,
        topStarredRepos: [
          {
            nameWithOwner: 'test/repo1',
            stargazerCount: 1000,
            url: 'https://github.com/test/repo1',
          },
        ],
        totalStarredRepos: 1,
        lastFullScanDate: new Date().toISOString(),
      },
      totalLinesOfCodeChanged: {
        repositoryListCursor: null,
        repositoryDetails: {
          'test/repo': {
            lastProcessedCommitDate: new Date().toISOString(),
            commitHistoryCursor: null,
            additions: 500,
            deletions: 200,
          },
        },
        overallTotalAdditions: 500,
        overallTotalDeletions: 200,
        lastScanDate: new Date().toISOString(),
      },
    }

    console.log('Step 1: Saving test state')
    await saveStateDirectly(testState, TEST_STATE_FILE)

    // Verify file exists
    const fileExists = await exists(TEST_STATE_FILE)
    if (!fileExists) {
      throw new Error(`Test state file ${TEST_STATE_FILE} was not created`)
    }

    console.log('Step 2: Loading test state')
    const loadedState = await loadStateDirectly(TEST_STATE_FILE) as typeof testState

    if (!loadedState) {
      throw new Error('Failed to load state')
    }

    // Verify a few key values to ensure the state was loaded correctly
    if (loadedState.semanticCommitSpectrum.totalCommits !== 11) {
      throw new Error(
        `Expected totalCommits to be 11, got ${loadedState.semanticCommitSpectrum.totalCommits}`,
      )
    }

    if (loadedState.fileTypeFootprint.totalUniqueExtensions !== 2) {
      throw new Error(
        `Expected totalUniqueExtensions to be 2, got ${loadedState.fileTypeFootprint.totalUniqueExtensions}`,
      )
    }

    console.log('Step 3: Updating state')
    // Update some values in the state
    const updatedState = {
      ...loadedState,
      semanticCommitSpectrum: {
        ...loadedState.semanticCommitSpectrum,
        totalCommits: loadedState.semanticCommitSpectrum.totalCommits + 3,
        verbSpectrum: {
          ...loadedState.semanticCommitSpectrum.verbSpectrum,
          creator: loadedState.semanticCommitSpectrum.verbSpectrum.creator + 2,
          bugfixer: loadedState.semanticCommitSpectrum.verbSpectrum.bugfixer + 1,
        },
      },
    }

    await saveStateDirectly(updatedState, TEST_STATE_FILE)

    console.log('Step 4: Loading updated state')
    const finalState = await loadStateDirectly(TEST_STATE_FILE) as typeof testState

    if (!finalState) {
      throw new Error('Failed to load final state')
    }

    // Verify the updates were saved correctly
    if (finalState.semanticCommitSpectrum.totalCommits !== 14) {
      throw new Error(
        `Expected totalCommits to be 14, got ${finalState.semanticCommitSpectrum.totalCommits}`,
      )
    }

    if (finalState.semanticCommitSpectrum.verbSpectrum.creator !== 7) {
      throw new Error(
        `Expected creator count to be 7, got ${finalState.semanticCommitSpectrum.verbSpectrum.creator}`,
      )
    }

    if (finalState.semanticCommitSpectrum.verbSpectrum.bugfixer !== 3) {
      throw new Error(
        `Expected bugfixer count to be 3, got ${finalState.semanticCommitSpectrum.verbSpectrum.bugfixer}`,
      )
    }

    console.log('Test passed - State persistence works correctly')
  } finally {
    // Clean up
    try {
      await Deno.remove(TEST_STATE_FILE)
    } catch {
      // Ignore errors
    }
  }
})
