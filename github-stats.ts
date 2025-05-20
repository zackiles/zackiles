import { graphql, GraphqlResponseError } from '@octokit/graphql'
import '@std/dotenv/load'
import { extname, join } from '@std/path'
import { emptyDir, ensureDir, exists } from '@std/fs'

// Define the state structure for persistence
export interface AppState {
  lastUpdated: string
  semanticCommitSpectrum: {
    lastFetchTime: string
    verbSpectrum: Record<string, number>
    totalCommits: number
  }
  fileTypeFootprint: {
    lastScanTime: string
    extensionCounts: Record<string, number>
    totalUniqueExtensions: number
  }
  codeVelocityDelta: {
    dailyAggregatedStats: Array<{ date: string; additions: number; deletions: number }>
    lastAggregatedDate: string
  }
  creatorTagSignature: {
    repoTopicData: Record<string, { updatedAt: string; topics: string[] }>
    aggregatedTopicCounts: Record<string, number>
    totalUniqueTags: number
  }
  starredTopicAffinity: {
    topicCounts: Record<string, number>
    lastProcessedStarredRepoCursor: string | null
    totalUniqueStarredTags: number
  }
  starPowerPicks: {
    allStarredReposList: Array<{ nameWithOwner: string; stargazerCount: number; url: string }>
    lastProcessedStarCursor: string | null
    topStarredRepos: Array<{ nameWithOwner: string; stargazerCount: number; url: string }>
    totalStarredRepos: number
    lastFullScanDate: string | null
  }
  totalLinesOfCodeChanged: {
    repositoryListCursor: string | null
    repositoryDetails: Record<string, {
      lastProcessedCommitDate: string
      commitHistoryCursor: string | null
      additions: number
      deletions: number
    }>
    overallTotalAdditions: number
    overallTotalDeletions: number
    lastScanDate: string | null
  }
}

// Default initial state
function getDefaultState(): AppState {
  return {
    lastUpdated: new Date().toISOString(),
    semanticCommitSpectrum: {
      lastFetchTime: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString(),
      verbSpectrum: {
        creator: 0,
        maintainer: 0,
        bugfixer: 0,
        cleaner: 0,
        refactorer: 0,
        experimenter: 0,
        other: 0,
      },
      totalCommits: 0,
    },
    fileTypeFootprint: {
      lastScanTime: new Date(0).toISOString(),
      extensionCounts: {},
      totalUniqueExtensions: 0,
    },
    codeVelocityDelta: {
      dailyAggregatedStats: [],
      lastAggregatedDate: new Date(new Date().setDate(new Date().getDate() - 400)).toISOString(),
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
  }
}

// State file path
const STATE_FILE_PATH = './github_stats_state.json'

// Load state from file or return default if file doesn't exist
async function loadState(): Promise<AppState> {
  try {
    if (await exists(STATE_FILE_PATH)) {
      const fileContent = await Deno.readTextFile(STATE_FILE_PATH)
      return JSON.parse(fileContent) as AppState
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn(`Error loading state file: ${errorMessage}. Creating new state.`)
  }
  return getDefaultState()
}

// Save state to file
async function saveState(state: AppState): Promise<void> {
  state.lastUpdated = new Date().toISOString()
  await Deno.writeTextFile(STATE_FILE_PATH, JSON.stringify(state, null, 2))
  console.debug('State saved successfully.')
}

// Cache for storing in-memory results (will be updated to use the persistent state)
const metricsCache = {
  starPowerPicks: null as {
    topStarredRepos: Array<{ nameWithOwner: string; stargazerCount: number; url: string }>
    totalStarredRepos: number
  } | null,
}

// Create the default octokit client
const defaultOctokit = graphql.defaults({
  headers: {
    authorization: `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
  },
})

// Allow overriding the client for testing
let octokit = defaultOctokit

// Export function to set a custom client for testing
export function setOctokitClient(client: typeof graphql) {
  octokit = client.defaults({
    headers: {
      authorization: 'Bearer test-token',
    },
  })
}

// Wrapper for octokit with retry logic and rate limit handling
async function safeOctokit<T>(
  query: string,
  variables?: Record<string, unknown>,
  retries = 5,
  initialBackoff = 2000,
  metricName = 'Unknown',
): Promise<T> {
  let currentRetry = 0
  const backoff = initialBackoff

  while (true) {
    try {
      console.debug(`Request starting: ${metricName}`)
      const result = await octokit<T>(query, variables)
      console.debug(`Request succeeded: ${metricName}`)
      return result
    } catch (error) {
      console.debug(`Request failed: ${metricName}`)

      // Check if this is a GraphQL error and specifically a rate limit error
      const isGraphqlError = error instanceof GraphqlResponseError
      const isRateLimit = isGraphqlError &&
        (error.message?.includes('rate limit') ||
          error.message?.includes('secondary rate limit'))

      if (currentRetry >= retries) {
        throw error
      }

      currentRetry++

      // Exponential backoff with jitter
      const jitter = Math.random() * 1000
      const waitTime = isRateLimit
        ? Math.max(backoff * 2 ** (currentRetry - 1) + jitter, 60000) // At least 60s for rate limits
        : backoff * 1.5 ** (currentRetry - 1) + jitter

      // If it's a GraphQL error, we can access more details
      if (isGraphqlError) {
        console.log(
          `GraphQL error for ${metricName}. Retrying in ${
            Math.round(waitTime / 1000)
          }s (attempt ${currentRetry}/${retries})`,
          error.errors, // This gives structured error information
        )
      } else {
        console.log(
          `Error for ${metricName}. Retrying in ${
            Math.round(waitTime / 1000)
          }s (attempt ${currentRetry}/${retries})`,
        )
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }
}

// Helper to get the logged in user's login name
async function getUsername() {
  const { viewer } = await safeOctokit<{ viewer: { login: string } }>(
    `
    query {
      viewer {
        login
      }
    }
  `,
    undefined,
    5,
    2000,
    'getUsername',
  )
  return viewer.login
}

// 1. Semantic Commit Spectrum
async function getSemanticCommitSpectrum(state: AppState) {
  const login = await getUsername()

  // Determine the incremental time range to fetch
  // We'll use the last fetch time from the state or default to one year ago
  const lastFetchTime = new Date(state.semanticCommitSpectrum.lastFetchTime)
  const now = new Date()

  // If we already have data and the last fetch was today, use existing state
  if (
    state.semanticCommitSpectrum.totalCommits > 0 &&
    lastFetchTime.toDateString() === now.toDateString()
  ) {
    return {
      result: {
        totalCommits: state.semanticCommitSpectrum.totalCommits,
        verbSpectrum: state.semanticCommitSpectrum.verbSpectrum,
      },
      updatedState: state,
    }
  }

  // GitHub API uses GitTimestamp format for commit history queries
  const { user } = await safeOctokit<{
    user: {
      repositories: {
        nodes: Array<{
          defaultBranchRef: {
            target: {
              history: {
                nodes: Array<{ message: string }>
              }
            }
          } | null
        }>
      }
    }
  }>(
    `
    query($login: String!, $since: GitTimestamp!) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: OWNER) {
          nodes {
            defaultBranchRef {
              target {
                ... on Commit {
                  history(since: $since) {
                    nodes {
                      message
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
    {
      login,
      since: lastFetchTime.toISOString(),
    },
    5,
    2000,
    'getSemanticCommitSpectrum',
  )

  // Extract commit messages
  const commitMessages: string[] = []
  for (const repo of user.repositories.nodes) {
    if (repo.defaultBranchRef?.target.history.nodes) {
      for (const commit of repo.defaultBranchRef.target.history.nodes) {
        commitMessages.push(commit.message)
      }
    }
  }

  // Extract first verb from each commit message
  const verbs = commitMessages
    .map((msg) => {
      const firstLine = msg.split('\n')[0].trim()
      const match = firstLine.match(/^(\w+)[:(]|^(\w+)\s/)
      return match ? (match[1] || match[2]).toLowerCase() : null
    })
    .filter(Boolean) as string[]

  // Define verb categories
  const categories = {
    creator: ['add', 'create', 'implement', 'init'],
    maintainer: ['update', 'bump', 'upgrade', 'improve', 'enhance'],
    bugfixer: ['fix', 'correct', 'resolve', 'patch'],
    cleaner: ['remove', 'delete', 'clean', 'prune'],
    refactorer: ['refactor', 'restructure', 'redesign'],
    experimenter: ['test', 'try', 'experiment'],
  }

  // Get existing counts from state
  const categoryCounts = { ...state.semanticCommitSpectrum.verbSpectrum }

  // Count new verbs by category
  for (const verb of verbs) {
    let found = false
    for (const [category, categoryVerbs] of Object.entries(categories)) {
      if (categoryVerbs.includes(verb)) {
        categoryCounts[category] = (categoryCounts[category] || 0) + 1
        found = true
        break
      }
    }

    if (!found) {
      categoryCounts.other = (categoryCounts.other || 0) + 1
    }
  }

  // Update state with new data
  const updatedState = { ...state }
  updatedState.semanticCommitSpectrum = {
    lastFetchTime: now.toISOString(),
    verbSpectrum: categoryCounts,
    totalCommits: (state.semanticCommitSpectrum.totalCommits || 0) + commitMessages.length,
  }

  const result = {
    totalCommits: updatedState.semanticCommitSpectrum.totalCommits,
    verbSpectrum: categoryCounts,
  }

  return {
    result,
    updatedState,
  }
}

// 2. File Type Footprint
async function getFileTypeFootprint(state: AppState) {
  const currentDate = new Date()
  const lastScanTime = new Date(state.fileTypeFootprint.lastScanTime)
  const oneDayAgo = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000)

  // If we already have data and the scan was done recently (within a day), use existing state
  if (
    Object.keys(state.fileTypeFootprint.extensionCounts).length > 0 &&
    lastScanTime > oneDayAgo
  ) {
    return {
      result: {
        totalUniqueExtensions: state.fileTypeFootprint.totalUniqueExtensions,
        extensionCounts: state.fileTypeFootprint.extensionCounts,
      },
      updatedState: state,
    }
  }

  const tempDir = await Deno.makeTempDir({ prefix: 'gh-stats-' })

  try {
    const login = await getUsername()

    // Get repos
    const { user } = await safeOctokit<{
      user: {
        repositories: {
          nodes: Array<{ name: string; url: string }>
        }
      }
    }>(
      `
      query($login: String!) {
        user(login: $login) {
          repositories(first: 100, ownerAffiliations: OWNER) {
            nodes {
              name
              url
            }
          }
        }
      }
    `,
      { login },
      5,
      2000,
      'getFileTypeFootprint-repos',
    )

    const repos = user.repositories.nodes
    const extensions = new Map<string, number>()

    for (const repo of repos.slice(0, 5)) { // Limit to 5 repos to avoid rate limiting and long exec time
      const repoDir = join(tempDir, repo.name)
      await ensureDir(repoDir)

      // Clone repo
      const cloneProcess = new Deno.Command('git', {
        args: ['clone', '--depth=1', repo.url, repoDir],
        stdout: 'null',
        stderr: 'null',
      })

      const { code: cloneCode } = await cloneProcess.output()

      if (cloneCode === 0) {
        // Get file list
        const fileListProcess = new Deno.Command('git', {
          args: ['ls-files'],
          cwd: repoDir,
          stdout: 'piped',
        })

        const { stdout } = await fileListProcess.output()
        const fileList = new TextDecoder().decode(stdout).split('\n')

        // Count extensions
        for (const file of fileList) {
          if (file) {
            const ext = extname(file).toLowerCase()
            if (ext) {
              extensions.set(ext, (extensions.get(ext) || 0) + 1)
            }
          }
        }
      }

      // Clean up repo
      await emptyDir(repoDir)
      await Deno.remove(repoDir, { recursive: true })
    }

    // Sort extensions by count
    const sortedExtensions = [...extensions.entries()]
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [key, value]) => {
        obj[key] = value
        return obj
      }, {} as Record<string, number>)

    // Update state
    const updatedState = { ...state }
    updatedState.fileTypeFootprint = {
      lastScanTime: currentDate.toISOString(),
      extensionCounts: sortedExtensions,
      totalUniqueExtensions: extensions.size,
    }

    return {
      result: {
        totalUniqueExtensions: extensions.size,
        extensionCounts: sortedExtensions,
      },
      updatedState,
    }
  } finally {
    // Clean up temp dir
    await Deno.remove(tempDir, { recursive: true })
  }
}

// 3. Code Velocity Delta
async function getCodeVelocityDelta(state: AppState) {
  const login = await getUsername()
  const updatedState = { ...state }

  // Current date info
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // Get the date to start fetching from
  const lastAggregatedDate = new Date(state.codeVelocityDelta.lastAggregatedDate)
  const nextDay = new Date(lastAggregatedDate)
  nextDay.setDate(nextDay.getDate() + 1)

  // If we need to fetch new data
  if (nextDay < now) {
    // Format the date for query
    const since = nextDay.toISOString()
    const until = now.toISOString()

    // Fetch stats for the period since last aggregation
    const newStats = await fetchDailyStats(login, since, until)

    // Add the new daily stats to the existing stats
    updatedState.codeVelocityDelta.dailyAggregatedStats = [
      ...state.codeVelocityDelta.dailyAggregatedStats,
      ...newStats,
    ]

    // Update the last aggregated date
    updatedState.codeVelocityDelta.lastAggregatedDate = today

    // Prune data older than 13 months to keep the state size reasonable
    const thirteenMonthsAgo = new Date()
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)
    const cutoffDate = thirteenMonthsAgo.toISOString().split('T')[0]

    updatedState.codeVelocityDelta.dailyAggregatedStats = updatedState.codeVelocityDelta
      .dailyAggregatedStats.filter(
        (stat) => stat.date >= cutoffDate,
      )
  }

  // Extract the stats we need for the velocity delta calculation

  // Calculate the window for current 30 days
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  // Calculate the window for the same 30-day period last year
  const lastYear = new Date(now)
  lastYear.setFullYear(now.getFullYear() - 1)
  const thirtyDaysAgoLastYear = new Date(lastYear)
  thirtyDaysAgoLastYear.setDate(lastYear.getDate() - 30)
  const lastYearStart = thirtyDaysAgoLastYear.toISOString().split('T')[0]
  const lastYearEnd = lastYear.toISOString().split('T')[0]

  // Filter stats for the current period
  const currentStats = updatedState.codeVelocityDelta.dailyAggregatedStats
    .filter((stat) => stat.date >= thirtyDaysAgoStr && stat.date <= today)
    .reduce(
      (acc, stat) => {
        acc.additions += stat.additions
        acc.deletions += stat.deletions
        acc.total += stat.additions + stat.deletions
        return acc
      },
      { additions: 0, deletions: 0, total: 0 },
    )

  // Filter stats for the last year period
  const lastYearStats = updatedState.codeVelocityDelta.dailyAggregatedStats
    .filter((stat) => stat.date >= lastYearStart && stat.date <= lastYearEnd)
    .reduce(
      (acc, stat) => {
        acc.additions += stat.additions
        acc.deletions += stat.deletions
        acc.total += stat.additions + stat.deletions
        return acc
      },
      { additions: 0, deletions: 0, total: 0 },
    )

  const delta = currentStats.total - lastYearStats.total

  return {
    result: {
      current: currentStats,
      lastYear: lastYearStats,
      delta,
    },
    updatedState,
  }
}

// Helper function to fetch daily stats for a period
async function fetchDailyStats(
  login: string,
  since: string,
  until: string,
): Promise<Array<{ date: string; additions: number; deletions: number }>> {
  const { user } = await safeOctokit<{
    user: {
      repositories: {
        nodes: Array<{
          defaultBranchRef: {
            target: {
              history: {
                nodes: Array<{
                  committedDate: string
                  additions: number
                  deletions: number
                }>
              }
            }
          } | null
        }>
      }
    }
  }>(
    `
    query($login: String!, $since: GitTimestamp!, $until: GitTimestamp!) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: OWNER) {
          nodes {
            defaultBranchRef {
              target {
                ... on Commit {
                  history(since: $since, until: $until) {
                    nodes {
                      committedDate
                      additions
                      deletions
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
    {
      login,
      since,
      until,
    },
    5,
    2000,
    `fetchDailyStats-${since}-${until}`,
  )

  // Aggregate commits by date
  const dailyStats = new Map<string, { additions: number; deletions: number }>()

  for (const repo of user.repositories.nodes) {
    if (repo.defaultBranchRef?.target.history.nodes) {
      for (const commit of repo.defaultBranchRef.target.history.nodes) {
        const date = commit.committedDate.split('T')[0]

        if (!dailyStats.has(date)) {
          dailyStats.set(date, { additions: 0, deletions: 0 })
        }

        const stats = dailyStats.get(date)
        if (stats) {
          stats.additions += commit.additions
          stats.deletions += commit.deletions
        }
      }
    }
  }

  // Convert map to array
  return Array.from(dailyStats.entries()).map(([date, stats]) => ({
    date,
    additions: stats.additions,
    deletions: stats.deletions,
  }))
}

// 4. Creator Tag Signature
async function getCreatorTagSignature(state: AppState) {
  const login = await getUsername()
  const updatedState = { ...state }

  // Check if we need to update (daily)
  const currentDate = new Date()
  const lastUpdateStr = state.creatorTagSignature.repoTopicData.lastUpdate as unknown as string
  const lastUpdate = lastUpdateStr ? new Date(lastUpdateStr) : new Date(0)
  const oneDayAgo = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000)

  // If we already have data and updated recently, use existing state
  if (
    Object.keys(state.creatorTagSignature.repoTopicData).length > 1 && // More than just 'lastUpdate'
    lastUpdate > oneDayAgo
  ) {
    return {
      result: {
        topTags: state.creatorTagSignature.aggregatedTopicCounts,
        totalUniqueTags: state.creatorTagSignature.totalUniqueTags,
      },
      updatedState: state,
    }
  }

  // Get repositories with their updatedAt timestamps
  const { user } = await safeOctokit<{
    user: {
      repositories: {
        nodes: Array<{
          nameWithOwner: string
          updatedAt: string
          repositoryTopics: {
            nodes: Array<{ topic: { name: string } }>
          }
        }>
      }
    }
  }>(
    `
    query($login: String!) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: OWNER) {
          nodes {
            nameWithOwner
            updatedAt
            repositoryTopics(first: 10) {
              nodes {
                topic {
                  name
                }
              }
            }
          }
        }
      }
    }
  `,
    { login },
    5,
    2000,
    'getCreatorTagSignature',
  )

  // Process repository data
  const repoTopicData = { ...state.creatorTagSignature.repoTopicData } as {
    [key: string]: { updatedAt: string; topics: string[] } | string
  }

  // Mark the last update time
  repoTopicData.lastUpdate = currentDate.toISOString()

  // Process each repository
  for (const repo of user.repositories.nodes) {
    const repoUpdatedAt = new Date(repo.updatedAt)
    const currentRepoData = repoTopicData[repo.nameWithOwner] as {
      updatedAt: string
      topics: string[]
    } | undefined

    // If this repo is new or updated since we last checked
    if (
      !currentRepoData ||
      new Date(currentRepoData.updatedAt) < repoUpdatedAt
    ) {
      const topics = repo.repositoryTopics.nodes.map((node) => node.topic.name)

      repoTopicData[repo.nameWithOwner] = {
        updatedAt: repo.updatedAt,
        topics,
      }
    }
  }

  // Calculate aggregated topic counts
  const topicCounts = new Map<string, number>()

  for (const repoKey of Object.keys(repoTopicData)) {
    // Skip the lastUpdate metadata key
    if (repoKey === 'lastUpdate') continue

    const repo = repoTopicData[repoKey] as { updatedAt: string; topics: string[] }
    for (const topic of repo.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
    }
  }

  // Sort topics by count
  const sortedTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {} as Record<string, number>)

  // Update state
  updatedState.creatorTagSignature = {
    repoTopicData: repoTopicData as unknown as Record<
      string,
      { updatedAt: string; topics: string[] }
    >,
    aggregatedTopicCounts: sortedTopics,
    totalUniqueTags: topicCounts.size,
  }

  return {
    result: {
      topTags: sortedTopics,
      totalUniqueTags: topicCounts.size,
    },
    updatedState,
  }
}

// 5. Starred Topic Affinity
async function getStarredTopicAffinity(state: AppState) {
  const updatedState = { ...state }

  // Check if we need to update (weekly basis)
  const currentDate = new Date()
  const lastFullScanDate = state.starPowerPicks.lastFullScanDate
    ? new Date(state.starPowerPicks.lastFullScanDate)
    : null
  const oneWeekAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000)

  // If we have recent data and the topic counts aren't empty, use existing state
  if (
    lastFullScanDate &&
    lastFullScanDate > oneWeekAgo &&
    Object.keys(state.starredTopicAffinity.topicCounts).length > 0
  ) {
    return {
      result: {
        topStarredTags: state.starredTopicAffinity.topicCounts,
        totalUniqueStarredTags: state.starredTopicAffinity.totalUniqueStarredTags,
      },
      updatedState: state,
    }
  }

  // Start a fresh scan or continue from where we left off
  const topicCounts = { ...state.starredTopicAffinity.topicCounts }
  let hasNextPage = true
  let cursor = state.starredTopicAffinity.lastProcessedStarredRepoCursor
  let pageCount = 0

  while (hasNextPage) {
    type StarredRepoQueryResult = {
      viewer: {
        starredRepositories: {
          pageInfo: {
            hasNextPage: boolean
            endCursor: string
          }
          nodes: Array<{
            repositoryTopics: {
              nodes: Array<{ topic: { name: string } }>
            }
          }>
        }
      }
    }

    pageCount++
    const queriedData: StarredRepoQueryResult = await safeOctokit<StarredRepoQueryResult>(
      `
      query($after: String) {
        viewer {
          starredRepositories(first: 25, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              repositoryTopics(first: 10) {
                nodes {
                  topic {
                    name
                  }
                }
              }
            }
          }
        }
      }
    `,
      { after: cursor },
      5,
      2000,
      `getStarredTopicAffinity-page-${pageCount}`,
    )

    const { viewer }: { viewer: StarredRepoQueryResult['viewer'] } = queriedData

    for (const repo of viewer.starredRepositories.nodes) {
      for (const node of repo.repositoryTopics.nodes) {
        const topic = node.topic.name
        topicCounts[topic] = (topicCounts[topic] || 0) + 1
      }
    }

    hasNextPage = viewer.starredRepositories.pageInfo.hasNextPage
    cursor = viewer.starredRepositories.pageInfo.endCursor

    // Update state after each page for resumability
    updatedState.starredTopicAffinity.topicCounts = topicCounts
    updatedState.starredTopicAffinity.lastProcessedStarredRepoCursor = cursor
    await saveState(updatedState)

    // Artificial delay to avoid hitting rate limits
    if (hasNextPage) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  // Sort by count (already in object form)
  const sortedTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {} as Record<string, number>)

  // Mark scan as complete
  updatedState.starredTopicAffinity = {
    topicCounts: sortedTopics,
    lastProcessedStarredRepoCursor: null,
    totalUniqueStarredTags: Object.keys(topicCounts).length,
  }

  // Share the completion data with starPowerPicks
  if (!updatedState.starPowerPicks.lastFullScanDate) {
    updatedState.starPowerPicks.lastFullScanDate = new Date().toISOString()
  }

  return {
    result: {
      topStarredTags: sortedTopics,
      totalUniqueStarredTags: Object.keys(topicCounts).length,
    },
    updatedState,
  }
}

// 6. Star Power Picks
async function getStarPowerPicks(state: AppState) {
  // Return in-memory cached data if available to avoid repeated calculations in the same session
  if (metricsCache.starPowerPicks) {
    return {
      result: metricsCache.starPowerPicks,
      updatedState: state,
    }
  }

  // Check if we have fairly recent data in our state (less than a day old)
  const currentTime = new Date()
  const lastFullScanDate = state.starPowerPicks.lastFullScanDate
    ? new Date(state.starPowerPicks.lastFullScanDate)
    : null
  const oneDayAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000)

  // If we have recent data and a complete scan, use it
  if (
    lastFullScanDate &&
    lastFullScanDate > oneDayAgo &&
    state.starPowerPicks.allStarredReposList.length > 0
  ) {
    const result = {
      topStarredRepos: state.starPowerPicks.topStarredRepos,
      totalStarredRepos: state.starPowerPicks.totalStarredRepos,
    }

    // Cache the result in memory
    metricsCache.starPowerPicks = result

    return {
      result,
      updatedState: state,
    }
  }

  // Start a fresh or continue an incomplete scan
  const starredRepos = [...state.starPowerPicks.allStarredReposList]
  let hasNextPage = true
  let cursor = state.starPowerPicks.lastProcessedStarCursor
  let pageCount = 0
  const updatedState = { ...state }

  while (hasNextPage) {
    type StarredReposResult = {
      viewer: {
        starredRepositories: {
          pageInfo: {
            hasNextPage: boolean
            endCursor: string
          }
          nodes: Array<{
            nameWithOwner: string
            stargazerCount: number
            url: string
          }>
        }
      }
    }

    pageCount++
    const queriedData: StarredReposResult = await safeOctokit<StarredReposResult>(
      `
      query($after: String) {
        viewer {
          starredRepositories(first: 25, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              nameWithOwner
              stargazerCount
              url
            }
          }
        }
      }
    `,
      { after: cursor },
      5,
      2000,
      `getStarPowerPicks-page-${pageCount}`,
    )

    const { viewer }: { viewer: StarredReposResult['viewer'] } = queriedData

    starredRepos.push(...viewer.starredRepositories.nodes)

    hasNextPage = viewer.starredRepositories.pageInfo.hasNextPage
    cursor = viewer.starredRepositories.pageInfo.endCursor

    // Update state after each successful page fetch
    updatedState.starPowerPicks.allStarredReposList = starredRepos
    updatedState.starPowerPicks.lastProcessedStarCursor = cursor
    await saveState(updatedState)

    // Add a delay between paginated requests to avoid hitting rate limits
    if (hasNextPage) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  // Mark the scan as complete
  updatedState.starPowerPicks.lastFullScanDate = new Date().toISOString()
  updatedState.starPowerPicks.lastProcessedStarCursor = null

  // Sort by star count and take top 10
  const topStarredRepos = starredRepos
    .sort((a, b) => b.stargazerCount - a.stargazerCount)
    .slice(0, 10)

  // Update the state with processed data
  updatedState.starPowerPicks.topStarredRepos = topStarredRepos
  updatedState.starPowerPicks.totalStarredRepos = starredRepos.length

  // Create the result
  const result = {
    topStarredRepos,
    totalStarredRepos: starredRepos.length,
  }

  // Cache the results in memory before returning
  metricsCache.starPowerPicks = result

  return {
    result,
    updatedState,
  }
}

// 7. Niche Scout Score
async function getNicheScoutScore(state: AppState) {
  // Get data from the Star Power Picks function
  const starPowerResult = await getStarPowerPicks(state)
  const { topStarredRepos, totalStarredRepos } = starPowerResult.result

  if (totalStarredRepos === 0) {
    return {
      result: { userMedian: 0, globalMedian: 15, score: 'unknown' },
      updatedState: starPowerResult.updatedState,
    }
  }

  // Extract star counts
  const starCounts = topStarredRepos.map((repo) => repo.stargazerCount)

  // Calculate median
  starCounts.sort((a, b) => a - b)
  const mid = Math.floor(starCounts.length / 2)
  const userMedian = starCounts.length % 2 === 0
    ? (starCounts[mid - 1] + starCounts[mid]) / 2
    : starCounts[mid]

  // Define global median benchmark
  const globalMedian = 15

  // Determine score
  let score = 'balanced'
  if (userMedian > globalMedian * 2) {
    score = 'mainstream-oriented'
  } else if (userMedian < globalMedian / 2) {
    score = 'discovery-oriented'
  }

  return {
    result: {
      userMedian,
      globalMedian,
      score,
    },
    updatedState: starPowerResult.updatedState,
  }
}

// 8. Total Lines of Code Changed
async function getTotalLinesOfCodeChanged(state: AppState) {
  const login = await getUsername()
  const updatedState = { ...state }

  // Initialize repository details if not exists
  if (!updatedState.totalLinesOfCodeChanged.repositoryDetails) {
    updatedState.totalLinesOfCodeChanged.repositoryDetails = {}
  }

  const repoDetails = updatedState.totalLinesOfCodeChanged.repositoryDetails
  let totalAdditions = updatedState.totalLinesOfCodeChanged.overallTotalAdditions || 0
  let totalDeletions = updatedState.totalLinesOfCodeChanged.overallTotalDeletions || 0

  // Check if we've already done a scan within the last week
  const currentDate = new Date()
  const lastScanDate = new Date(updatedState.totalLinesOfCodeChanged.lastScanDate || 0)
  const oneWeekAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000)

  // If we've recently done a complete scan, return the cached result
  if (lastScanDate > oneWeekAgo && Object.keys(repoDetails).length > 0) {
    return {
      result: {
        total_additions: totalAdditions,
        total_deletions: totalDeletions,
        net_change: totalAdditions - totalDeletions,
      },
      updatedState,
    }
  }

  // Fetch repositories with pagination
  const fetchRepositories = async (after: string | null = null): Promise<{
    repositories: Array<{ name: string; url: string }>
    hasNextPage: boolean
    endCursor: string | null
  }> => {
    type RepositoryQueryResult = {
      user: {
        repositories: {
          pageInfo: {
            hasNextPage: boolean
            endCursor: string | null
          }
          nodes: Array<{
            name: string
            url: string
          }>
        }
      }
    }

    const { user } = await safeOctokit<RepositoryQueryResult>(
      `
      query($login: String!, $after: String) {
        user(login: $login) {
          repositories(first: 50, after: $after, ownerAffiliations: OWNER) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              name
              url
            }
          }
        }
      }
    `,
      { login, after },
      5,
      2000,
      'getTotalLinesOfCodeChanged-repositories',
    )

    return {
      repositories: user.repositories.nodes,
      hasNextPage: user.repositories.pageInfo.hasNextPage,
      endCursor: user.repositories.pageInfo.endCursor,
    }
  }

  // Process commits for a single repository
  const processRepositoryCommits = async (
    repoName: string,
    repoUrl: string,
    existingRepoDetails?: {
      lastProcessedCommitDate?: string
      commitHistoryCursor?: string | null
      additions?: number
      deletions?: number
    },
  ): Promise<{
    additions: number
    deletions: number
    lastProcessedCommitDate: string
  }> => {
    // Using repoName for GitHub API queries, repoUrl is kept for potential future use
    console.debug(`Processing commits for ${repoName} (${repoUrl})`)

    let additions = existingRepoDetails?.additions || 0
    let deletions = existingRepoDetails?.deletions || 0
    let commitCursor = existingRepoDetails?.commitHistoryCursor || null
    let lastProcessedCommitDate = existingRepoDetails?.lastProcessedCommitDate ||
      '1970-01-01T00:00:00Z'

    // First, check if the user has made any commits to this repository
    // This helps us quickly skip repositories with no contributions
    type ContributionCheckResult = {
      user: {
        repository: {
          defaultBranchRef: {
            target: {
              history: {
                totalCount: number
              }
            } | null
          } | null
        }
      }
    }

    const contributionCheck = await safeOctokit<ContributionCheckResult>(
      `
      query($login: String!, $repoName: String!) {
        user(login: $login) {
          repository(name: $repoName) {
            defaultBranchRef {
              target {
                ... on Commit {
                  history(author: {emails: [$login, "${login}@users.noreply.github.com"]}) {
                    totalCount
                  }
                }
              }
            }
          }
        }
      }
      `,
      {
        login,
        repoName,
      },
      3,
      1000,
      `getTotalLinesOfCodeChanged-${repoName}-check`,
    )

    // Check if user has any commits in this repo
    const commitCount =
      contributionCheck.user.repository?.defaultBranchRef?.target?.history.totalCount || 0

    if (commitCount === 0) {
      console.log(`Skipping ${repoName}: No commits by the authenticated user`)
      return { additions: 0, deletions: 0, lastProcessedCommitDate }
    }

    console.log(`Found ${commitCount} commits by user in ${repoName}, processing details...`)

    type CommitHistoryResult = {
      user: {
        repository: {
          defaultBranchRef: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: boolean
                  endCursor: string | null
                }
                nodes: Array<{
                  committedDate: string
                  additions: number
                  deletions: number
                }>
              }
            } | null
          } | null
        }
      }
    }

    while (true) {
      const commitData: CommitHistoryResult = await safeOctokit<CommitHistoryResult>(
        `
        query($login: String!, $repoName: String!, $after: String) {
          user(login: $login) {
            repository(name: $repoName) {
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(first: 50, after: $after, author: {emails: [$login, "${login}@users.noreply.github.com"]}) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      nodes {
                        committedDate
                        additions
                        deletions
                      }
                    }
                  }
                }
              }
            }
          }
        }
        `,
        {
          login,
          repoName,
          after: commitCursor,
        },
        5,
        2000,
        `getTotalLinesOfCodeChanged-${repoName}-commits`,
      )

      // Handle possible null values in the chain
      const defaultBranchRef = commitData.user.repository.defaultBranchRef
      if (!defaultBranchRef) break

      const target = defaultBranchRef.target
      if (!target) break

      const history = target.history
      if (!history) break

      // Process commits
      for (const commit of history.nodes) {
        additions += commit.additions
        deletions += commit.deletions
        lastProcessedCommitDate = commit.committedDate
      }

      commitCursor = history.pageInfo.endCursor

      if (!history.pageInfo.hasNextPage) break

      // Add a small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return { additions, deletions, lastProcessedCommitDate }
  }

  // Main processing logic
  const processAllRepositories = async () => {
    let hasNextPage = true
    let repositoryCursor: string | null = updatedState.totalLinesOfCodeChanged.repositoryListCursor

    while (hasNextPage) {
      const { repositories, hasNextPage: moreRepos, endCursor } = await fetchRepositories(
        repositoryCursor,
      )

      // Process repositories in limited batches to control concurrency
      const chunkSize = 5 // Process 5 repos at a time
      for (let i = 0; i < repositories.length; i += chunkSize) {
        const batch = repositories.slice(i, i + chunkSize)

        const processingTasks = batch.map(async (repo) => {
          // Check if we've already processed this repo
          const existingRepoDetails = repoDetails[repo.name]

          try {
            const repoCommitStats = await processRepositoryCommits(
              repo.name,
              repo.url,
              existingRepoDetails,
            )

            // Update repo details in state
            repoDetails[repo.name] = {
              lastProcessedCommitDate: repoCommitStats.lastProcessedCommitDate,
              commitHistoryCursor: null, // Reset cursor as we've fully processed
              additions: repoCommitStats.additions,
              deletions: repoCommitStats.deletions,
            }

            // Update overall totals
            if (!existingRepoDetails) {
              // Only add to overall totals if this is new data
              totalAdditions += repoCommitStats.additions
              totalDeletions += repoCommitStats.deletions
            } else if (
              repoCommitStats.additions !== existingRepoDetails.additions ||
              repoCommitStats.deletions !== existingRepoDetails.deletions
            ) {
              // If we have updated values, adjust the totals
              totalAdditions += repoCommitStats.additions - (existingRepoDetails.additions || 0)
              totalDeletions += repoCommitStats.deletions - (existingRepoDetails.deletions || 0)
            }

            console.log(
              `Processed ${repo.name}: +${repoCommitStats.additions}, -${repoCommitStats.deletions}`,
            )
          } catch (error) {
            console.error(`Failed to process repo ${repo.name}:`, error)
          }
        })

        // Process each batch of repos
        await Promise.all(processingTasks)

        // Save state after processing each batch to allow resuming
        updatedState.totalLinesOfCodeChanged.overallTotalAdditions = totalAdditions
        updatedState.totalLinesOfCodeChanged.overallTotalDeletions = totalDeletions
        updatedState.totalLinesOfCodeChanged.repositoryListCursor = endCursor
        await saveState(updatedState)
      }

      repositoryCursor = endCursor
      hasNextPage = moreRepos

      // Add a delay between pagination to avoid rate limits
      if (hasNextPage) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }

  // Start processing
  await processAllRepositories()

  // Update final state with completed scan
  updatedState.totalLinesOfCodeChanged.overallTotalAdditions = totalAdditions
  updatedState.totalLinesOfCodeChanged.overallTotalDeletions = totalDeletions
  updatedState.totalLinesOfCodeChanged.lastScanDate = currentDate.toISOString()
  updatedState.totalLinesOfCodeChanged.repositoryListCursor = null // Reset cursor for next full scan

  return {
    result: {
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      net_change: totalAdditions - totalDeletions,
    },
    updatedState,
  }
}

async function main() {
  // Load the current state
  let state = await loadState()
  console.log('State loaded successfully.')

  // Define all metrics to collect with correct typing
  type MetricFunction = (state: AppState) => Promise<{ result: unknown; updatedState: AppState }>

  interface Metric {
    name: string
    fn: MetricFunction
  }

  const metrics: Metric[] = [
    {
      name: '🧠 Semantic Commit Spectrum',
      fn: getSemanticCommitSpectrum,
    },
    {
      name: '📁 File Type Footprint',
      fn: getFileTypeFootprint,
    },
    {
      name: '⚡ Code Velocity Delta',
      fn: getCodeVelocityDelta,
    },
    {
      name: '🏷️ Creator Tag Signature',
      fn: getCreatorTagSignature,
    },
    {
      name: '⭐ Starred Topic Affinity',
      fn: getStarredTopicAffinity,
    },
    {
      name: '🔝 Star Power Picks',
      fn: getStarPowerPicks,
    },
    {
      name: '🔍 Niche Scout Score',
      fn: getNicheScoutScore,
    },
    {
      name: '📊 Total Lines of Code Changed',
      fn: getTotalLinesOfCodeChanged,
    },
  ]

  console.log('Fetching GitHub stats...\n')

  // Helper to format error messages
  const formatError = (error: unknown) => error instanceof Error ? error.message : String(error)

  // Run metrics sequentially to avoid overwhelming the API
  const results = []

  for (const metric of metrics) {
    console.log(`Starting: ${metric.name}`)

    try {
      // Pass the current state to the metric function
      const metricResult = await metric.fn(state)

      // Update our state with the result from this metric
      state = metricResult.updatedState

      // Save state after each successful metric
      await saveState(state)

      // Store the actual result data
      results.push({ name: metric.name, data: metricResult.result })
      console.log(`Completed: ${metric.name}`)
    } catch (error) {
      console.error(`Failed: ${metric.name} - ${formatError(error)}`)
      results.push({ name: metric.name, error: formatError(error) })
    }

    // Add delay between metrics
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // Print results
  results.forEach((result, index) => {
    console.log(result.name)

    if ('data' in result) {
      console.log(result.data)
    } else if ('error' in result) {
      console.error(`Error: ${result.error}`)
    }

    // Add newline between metrics except for the last one
    if (index < results.length - 1) {
      console.log('\n')
    }
  })
}

if (import.meta.main) {
  await main().catch(console.error)
}

// Export functions for testing
export { getSemanticCommitSpectrum, loadState, saveState }
