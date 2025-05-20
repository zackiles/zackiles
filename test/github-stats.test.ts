// Install required packages first:
// deno add @std/testing

import { assertEquals, assertExists } from '@std/assert'
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd'
import { exists, ensureDir } from '@std/fs'
import { join, dirname } from '@std/path'
import type { graphql } from '@octokit/graphql'
import type { RequestParameters } from '@octokit/types'

// Import the AppState type and setOctokitClient function from the main module
import type { AppState } from '../github-stats.ts'

// Helper to read and parse the state file
async function readStateFile(path: string) {
  const content = await Deno.readTextFile(path)
  return JSON.parse(content)
}

// Mock for the GitHub API client
const originalFetch = globalThis.fetch

// Mock the octokit client
const mockOctokit = Object.assign(
  async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
    // Mock for viewer query (username)
    if (query.includes('viewer')) {
      return {
        viewer: { login: 'test-user' },
      } as T
    }

    // Mock for semantic commit spectrum
    if (query.includes('repositories') && query.includes('history')) {
      return {
        user: {
          repositories: {
            nodes: [
              {
                defaultBranchRef: {
                  target: {
                    history: {
                      nodes: [
                        { message: 'feat: new feature' },
                        { message: 'fix: critical bug' },
                        { message: 'docs: update documentation' },
                        { message: 'refactor: improve code structure' },
                        { message: 'chore: cleanup old files' },
                        { message: 'test: add new tests' },
                        { message: 'add: new component' },
                        { message: 'create: new service' },
                        { message: 'implement: new algorithm' },
                        { message: 'update: dependencies' },
                        { message: 'improve: performance' },
                        { message: 'enhance: user experience' },
                        { message: 'remove: deprecated code' },
                        { message: 'delete: unused files' },
                        { message: 'clean: codebase' },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      } as T
    }

    // Default response
    return {
      viewer: { login: 'test-user' },
      user: {
        repositories: {
          nodes: [],
        },
      },
    } as T
  },
  {
    defaults: (newDefaults: RequestParameters) => mockOctokit,
    endpoint: {
      merge: () => '',
      parse: () => ({ method: 'GET', url: '' }),
      DEFAULTS: { method: 'GET', headers: {} },
    },
  }
) as unknown as typeof graphql

// Mock the graphql module
const mockGraphql = Object.assign(mockOctokit, {
  defaults: () => mockOctokit,
})

// Restore original fetch and modules
function restoreOriginals() {
  globalThis.fetch = originalFetch
}

// Main test suite
describe('GitHub Stats State Management', () => {
  const TEST_STATE_FILE = './github_stats_state.json'

  // Import the functions we want to test
  // We need to dynamically import to properly mock fetch before importing
  let loadState: (filePath?: string) => Promise<AppState>
  let saveState: (state: AppState) => Promise<void>
  let getSemanticCommitSpectrum: (state: AppState) => Promise<{
    result: { verbSpectrum: Record<string, number>; totalCommits: number }
    updatedState: AppState
  }>
  let setOctokitClient: (client: typeof mockOctokit) => void

  beforeEach(async () => {
    // Ensure test directory exists
    await ensureDir(dirname(TEST_STATE_FILE))

    // Create an initial test environment variable to avoid errors
    Deno.env.set('GITHUB_TOKEN', 'test-token')

    // Delete test state file if it exists
    try {
      await Deno.remove(TEST_STATE_FILE)
    } catch {
      // Ignore errors if file doesn't exist
    }

    // Dynamically import the module to test
    const module = await import('../github-stats.ts')

    console.log('Module exports:', Object.keys(module))

    // Handle the case where the functions might be exported directly or as properties
    // of the default export
    if (typeof module.loadState === 'function') {
      loadState = module.loadState
      saveState = module.saveState
      getSemanticCommitSpectrum = module.getSemanticCommitSpectrum
      setOctokitClient = module.setOctokitClient
      console.log('Found required functions in module')

      // Set up the mock client
      setOctokitClient(mockOctokit)
    } else {
      // If the module doesn't expose these functions, stub them
      // This is just to make TypeScript happy - the test will likely fail anyway
      loadState = async () => ({
        lastUpdated: new Date().toISOString(),
        semanticCommitSpectrum: {
          lastFetchTime: new Date().toISOString(),
          verbSpectrum: {},
          totalCommits: 0,
        },
        fileTypeFootprint: {
          lastScanTime: '',
          extensionCounts: {},
          totalUniqueExtensions: 0,
        },
        codeVelocityDelta: {
          dailyAggregatedStats: [],
          lastAggregatedDate: '',
        },
        creatorTagSignature: {
          repoTopicData: {},
          aggregatedTopicCounts: {},
          totalUniqueTags: 0,
        },
        starredTopicAffinity: {
          topicCounts: {},
          lastProcessedStarredRepoCursor: null,
          totalUniqueStarredTags: 0,
        },
        starPowerPicks: {
          allStarredReposList: [],
          lastProcessedStarCursor: null,
          topStarredRepos: [],
          totalStarredRepos: 0,
          lastFullScanDate: null,
        },
        totalLinesOfCodeChanged: {
          repositoryListCursor: null,
          repositoryDetails: {},
          overallTotalAdditions: 0,
          overallTotalDeletions: 0,
          lastScanDate: null,
        },
      })
      saveState = async () => {}
      getSemanticCommitSpectrum = async () => ({
        result: { verbSpectrum: {}, totalCommits: 0 },
        updatedState: {
          lastUpdated: new Date().toISOString(),
          semanticCommitSpectrum: {
            lastFetchTime: new Date().toISOString(),
            verbSpectrum: {},
            totalCommits: 0,
          },
          fileTypeFootprint: {
            lastScanTime: '',
            extensionCounts: {},
            totalUniqueExtensions: 0,
          },
          codeVelocityDelta: {
            dailyAggregatedStats: [],
            lastAggregatedDate: '',
          },
          creatorTagSignature: {
            repoTopicData: {},
            aggregatedTopicCounts: {},
            totalUniqueTags: 0,
          },
          starredTopicAffinity: {
            topicCounts: {},
            lastProcessedStarredRepoCursor: null,
            totalUniqueStarredTags: 0,
          },
          starPowerPicks: {
            allStarredReposList: [],
            lastProcessedStarCursor: null,
            topStarredRepos: [],
            totalStarredRepos: 0,
            lastFullScanDate: null,
          },
          totalLinesOfCodeChanged: {
            repositoryListCursor: null,
            repositoryDetails: {},
            overallTotalAdditions: 0,
            overallTotalDeletions: 0,
            lastScanDate: null,
          },
        },
      })
      setOctokitClient = () => {}
      console.warn('Could not find required functions in module. Test will likely fail.')
    }
  })

  afterEach(async () => {
    // Clean up and restore original fetch and modules
    restoreOriginals()

    // Delete test state file if it exists
    try {
      await Deno.remove(TEST_STATE_FILE)
    } catch {
      // Ignore errors if file doesn't exist
    }
  })

  it('should save and load state correctly', async () => {
    // Create a test state
    const testState = {
      lastUpdated: new Date().toISOString(),
      semanticCommitSpectrum: {
        lastFetchTime: new Date().toISOString(),
        verbSpectrum: { creator: 5, bugfixer: 3 },
        totalCommits: 8,
      },
      // Include minimal required state structure
      fileTypeFootprint: { lastScanTime: '', extensionCounts: {}, totalUniqueExtensions: 0 },
      codeVelocityDelta: { dailyAggregatedStats: [], lastAggregatedDate: '' },
      creatorTagSignature: { repoTopicData: {}, aggregatedTopicCounts: {}, totalUniqueTags: 0 },
      starredTopicAffinity: {
        topicCounts: {},
        lastProcessedStarredRepoCursor: null,
        totalUniqueStarredTags: 0,
      },
      starPowerPicks: {
        allStarredReposList: [],
        lastProcessedStarCursor: null,
        topStarredRepos: [],
        totalStarredRepos: 0,
        lastFullScanDate: null,
      },
      totalLinesOfCodeChanged: {
        repositoryListCursor: null,
        repositoryDetails: {},
        overallTotalAdditions: 0,
        overallTotalDeletions: 0,
        lastScanDate: null,
      },
    }

    // Print the current working directory for debugging
    console.log('Current directory:', Deno.cwd())
    console.log('Using test file path:', TEST_STATE_FILE)

    // Save the test state to our test file
    await saveState(testState)

    // Check if the file exists directly
    try {
      const stats = await Deno.stat(TEST_STATE_FILE)
      console.log('File exists with size:', stats.size)
    } catch (err) {
      console.error('Error checking file:', err)
    }

    // Verify the file was created
    const fileExists = await exists(TEST_STATE_FILE)
    console.log('File exists according to @std/fs/exists:', fileExists)
    assertEquals(fileExists, true, 'State file should be created')

    // Load the state and verify it matches
    const loadedState = await readStateFile(TEST_STATE_FILE)
    assertEquals(loadedState.semanticCommitSpectrum.verbSpectrum.creator, 5)
    assertEquals(loadedState.semanticCommitSpectrum.verbSpectrum.bugfixer, 3)
    assertEquals(loadedState.semanticCommitSpectrum.totalCommits, 8)
  })

  it('should update state incrementally when processing metrics', async () => {
    // Setup an initial state with some data
    const initialState = {
      lastUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // yesterday
      semanticCommitSpectrum: {
        lastFetchTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        verbSpectrum: {
          creator: 2,
          bugfixer: 1,
          maintainer: 1,
          cleaner: 0,
          refactorer: 0,
          experimenter: 0,
          other: 0,
        },
        totalCommits: 4,
      },
      // Include minimal required state structure
      fileTypeFootprint: { lastScanTime: '', extensionCounts: {}, totalUniqueExtensions: 0 },
      codeVelocityDelta: { dailyAggregatedStats: [], lastAggregatedDate: '' },
      creatorTagSignature: { repoTopicData: {}, aggregatedTopicCounts: {}, totalUniqueTags: 0 },
      starredTopicAffinity: {
        topicCounts: {},
        lastProcessedStarredRepoCursor: null,
        totalUniqueStarredTags: 0,
      },
      starPowerPicks: {
        allStarredReposList: [],
        lastProcessedStarCursor: null,
        topStarredRepos: [],
        totalStarredRepos: 0,
        lastFullScanDate: null,
      },
      totalLinesOfCodeChanged: {
        repositoryListCursor: null,
        repositoryDetails: {},
        overallTotalAdditions: 0,
        overallTotalDeletions: 0,
        lastScanDate: null,
      },
    }

    // Save the initial state
    await saveState(initialState)

    // Load the initial state
    const state = await loadState(TEST_STATE_FILE)

    // Run the getSemanticCommitSpectrum function which should update state
    const result = await getSemanticCommitSpectrum(state)

    // Check that the result contains both result and updatedState
    assertExists(result.result, 'Result should contain the metric result')
    assertExists(result.updatedState, 'Result should contain the updated state')

    // Verify the spectrum was updated (should have additions from our mock)
    const { verbSpectrum, totalCommits } = result.result

    // Check the values were updated according to our mock data
    assertEquals(verbSpectrum.creator >= 3, true, 'Creator count should be at least 3') // feat
    assertEquals(verbSpectrum.bugfixer >= 2, true, 'Bugfixer count should be at least 2') // fix
    assertEquals(verbSpectrum.maintainer >= 2, true, 'Maintainer count should be at least 2') // docs
    assertEquals(verbSpectrum.refactorer >= 1, true, 'Refactorer count should be at least 1') // refactor
    assertEquals(verbSpectrum.cleaner >= 1, true, 'Cleaner count should be at least 1') // chore
    assertEquals(verbSpectrum.experimenter >= 1, true, 'Experimenter count should be at least 1') // test

    // Total commits should be greater than before
    assertEquals(totalCommits >= 10, true, 'Total commits should be at least 10')

    // Verify that lastFetchTime was updated
    const updatedState = result.updatedState
    const currentTime = new Date()
    const lastFetchTime = new Date(updatedState.semanticCommitSpectrum.lastFetchTime)
    assertEquals(lastFetchTime <= currentTime, true, 'Last fetch time should be updated')
    assertEquals(
      lastFetchTime > new Date(initialState.semanticCommitSpectrum.lastFetchTime),
      true,
      'Last fetch time should be newer than initial state',
    )
  })
})

// Run tests with Deno's test runner
Deno.test('GitHub Stats State Management Tests', async (t) => {
  await t.step('Run BDD tests', async () => {
    // Execute the tests defined above
    await describe('GitHub Stats State Management', () => {})
  })
})
