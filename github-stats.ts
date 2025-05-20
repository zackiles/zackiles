import { graphql, GraphqlResponseError } from '@octokit/graphql'
import '@std/dotenv/load'
import { extname, join } from '@std/path'
import { emptyDir, ensureDir } from '@std/fs'

const octokit = graphql.defaults({
  headers: {
    authorization: `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
  },
})

// Cache for storing expensive API call results
const metricsCache = {
  starPowerPicks: null as {
    topStarredRepos: Array<{ nameWithOwner: string; stargazerCount: number; url: string }>
    totalStarredRepos: number
  } | null,
} as const

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
async function getSemanticCommitSpectrum() {
  const login = await getUsername()
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

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
      since: oneYearAgo.toISOString(),
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

  // Count verbs by category
  const categoryCounts = {
    creator: 0,
    maintainer: 0,
    bugfixer: 0,
    cleaner: 0,
    refactorer: 0,
    experimenter: 0,
    other: 0,
  }

  for (const verb of verbs) {
    let found = false
    for (const [category, categoryVerbs] of Object.entries(categories)) {
      if (categoryVerbs.includes(verb)) {
        categoryCounts[category as keyof typeof categoryCounts]++
        found = true
        break
      }
    }

    if (!found) {
      categoryCounts.other++
    }
  }

  return {
    totalCommits: commitMessages.length,
    verbSpectrum: categoryCounts,
  }
}

// 2. File Type Footprint
async function getFileTypeFootprint() {
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

    return {
      totalUniqueExtensions: extensions.size,
      extensionCounts: sortedExtensions,
    }
  } finally {
    // Clean up temp dir
    await Deno.remove(tempDir, { recursive: true })
  }
}

// 3. Code Velocity Delta
async function getCodeVelocityDelta() {
  const login = await getUsername()

  // Current 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)

  // Same 30-day range from last year
  const lastYear = new Date(now)
  lastYear.setFullYear(now.getFullYear() - 1)
  const thirtyDaysAgoLastYear = new Date(lastYear)
  thirtyDaysAgoLastYear.setDate(lastYear.getDate() - 30)

  // Function to get stats for a time window
  async function getStatsForTimeWindow(since: Date, until: Date, windowName: string) {
    const { user } = await safeOctokit<{
      user: {
        repositories: {
          nodes: Array<{
            defaultBranchRef: {
              target: {
                history: {
                  nodes: Array<{ additions: number; deletions: number }>
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
        since: since.toISOString(),
        until: until.toISOString(),
      },
      5,
      2000,
      `getCodeVelocityDelta-${windowName}`,
    )

    let totalAdditions = 0
    let totalDeletions = 0

    for (const repo of user.repositories.nodes) {
      if (repo.defaultBranchRef?.target.history.nodes) {
        for (const commit of repo.defaultBranchRef.target.history.nodes) {
          totalAdditions += commit.additions
          totalDeletions += commit.deletions
        }
      }
    }

    return {
      additions: totalAdditions,
      deletions: totalDeletions,
      total: totalAdditions + totalDeletions,
    }
  }

  const currentStats = await getStatsForTimeWindow(thirtyDaysAgo, now, 'current')
  const lastYearStats = await getStatsForTimeWindow(thirtyDaysAgoLastYear, lastYear, 'lastYear')

  const delta = currentStats.total - lastYearStats.total

  return {
    current: currentStats,
    lastYear: lastYearStats,
    delta,
  }
}

// 4. Creator Tag Signature
async function getCreatorTagSignature() {
  const login = await getUsername()

  const { user } = await safeOctokit<{
    user: {
      repositories: {
        nodes: Array<{
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

  const topicCounts = new Map<string, number>()

  for (const repo of user.repositories.nodes) {
    for (const node of repo.repositoryTopics.nodes) {
      const topic = node.topic.name
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
    }
  }

  const sortedTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {} as Record<string, number>)

  return {
    topTags: sortedTopics,
    totalUniqueTags: topicCounts.size,
  }
}

// 5. Starred Topic Affinity
async function getStarredTopicAffinity() {
  const topicCounts = new Map<string, number>()
  let hasNextPage = true
  let cursor: string | null = null
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
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
      }
    }

    hasNextPage = viewer.starredRepositories.pageInfo.hasNextPage
    cursor = viewer.starredRepositories.pageInfo.endCursor

    // Artificial delay to avoid hitting rate limits
    if (hasNextPage) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  const sortedTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {} as Record<string, number>)

  return {
    topStarredTags: sortedTopics,
    totalUniqueStarredTags: topicCounts.size,
  }
}

// 6. Star Power Picks
async function getStarPowerPicks() {
  // Return cached data if available
  if (metricsCache.starPowerPicks) {
    return metricsCache.starPowerPicks
  }

  const starredRepos: Array<{ nameWithOwner: string; stargazerCount: number; url: string }> = []
  let hasNextPage = true
  let cursor: string | null = null
  let pageCount = 0

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

    // Add a delay between paginated requests to avoid hitting rate limits
    if (hasNextPage) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  // Sort by star count and take top 10
  const topStarredRepos = starredRepos
    .sort((a, b) => b.stargazerCount - a.stargazerCount)
    .slice(0, 10)

  // Cache the results before returning
  metricsCache.starPowerPicks = {
    topStarredRepos,
    totalStarredRepos: starredRepos.length,
  }

  return metricsCache.starPowerPicks
}

// 7. Niche Scout Score
async function getNicheScoutScore() {
  // Get data from cache if available, otherwise fetch it
  const { topStarredRepos, totalStarredRepos } = metricsCache.starPowerPicks ??
    await getStarPowerPicks()

  if (totalStarredRepos === 0) {
    return { userMedian: 0, globalMedian: 15, score: 'unknown' }
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
    userMedian,
    globalMedian,
    score,
  }
}

// 8. Total Lines of Code Changed
async function getTotalLinesOfCodeChanged() {
  const login = await getUsername()
  let totalAdditions = 0
  let totalDeletions = 0
  let repoCount = 0

  async function processRepositories(after: string | null = null) {
    type RepositoryQueryResult = {
      user: {
        repositories: {
          pageInfo: {
            hasNextPage: boolean
            endCursor: string
          }
          nodes: Array<{
            name: string
            defaultBranchRef: {
              target: {
                history: {
                  pageInfo: {
                    hasNextPage: boolean
                    endCursor: string
                  }
                  nodes: Array<{
                    additions: number
                    deletions: number
                  }>
                }
              }
            } | null
          }>
        }
      }
    }

    const { user } = await safeOctokit<RepositoryQueryResult>(
      `
      query($login: String!, $after: String) {
        user(login: $login) {
          repositories(first: 100, after: $after, ownerAffiliations: OWNER) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              name
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(first: 50) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      nodes {
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
      { login, after },
      5,
      2000,
      `getTotalLinesOfCodeChanged-repos-${repoCount}`,
    )

    // Process each repository
    for (const repo of user.repositories.nodes) {
      repoCount++
      if (!repo.defaultBranchRef) continue

      // Process commits
      let commitCursor: string | null = null
      let hasNextCommitPage = true
      let commitPageCount = 0

      while (hasNextCommitPage) {
        commitPageCount++
        type CommitHistoryResult = {
          user: {
            repository: {
              defaultBranchRef: {
                target: {
                  history: {
                    pageInfo: {
                      hasNextPage: boolean
                      endCursor: string
                    }
                    nodes: Array<{
                      additions: number
                      deletions: number
                    }>
                  }
                }
              } | null
            }
          }
        }

        const commitData: CommitHistoryResult = await safeOctokit<CommitHistoryResult>(
          `
          query($login: String!, $repoName: String!, $after: String) {
            user(login: $login) {
              repository(name: $repoName) {
                defaultBranchRef {
                  target {
                    ... on Commit {
                      history(first: 100, after: $after) {
                        pageInfo {
                          hasNextPage
                          endCursor
                        }
                        nodes {
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
            repoName: repo.name,
            after: commitCursor,
          },
          5,
          2000,
          `getTotalLinesOfCodeChanged-repo-${repoCount}-commits-${commitPageCount}`,
        )

        const { user: repoUser }: { user: CommitHistoryResult['user'] } = commitData

        if (!repoUser.repository.defaultBranchRef) break

        const commitHistory = repoUser.repository.defaultBranchRef.target.history

        // Sum additions and deletions
        for (const commit of commitHistory.nodes) {
          totalAdditions += commit.additions
          totalDeletions += commit.deletions
        }

        hasNextCommitPage = commitHistory.pageInfo.hasNextPage
        commitCursor = commitHistory.pageInfo.endCursor

        // Add a delay to avoid rate limits
        if (hasNextCommitPage) {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }

      // Add a delay between processing repositories to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }

    // Check if there are more repositories
    if (user.repositories.pageInfo.hasNextPage) {
      // Add a delay between paginated requests
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await processRepositories(user.repositories.pageInfo.endCursor)
    }
  }

  await processRepositories()

  return {
    total_additions: totalAdditions,
    total_deletions: totalDeletions,
    net_change: totalAdditions - totalDeletions,
  }
}

async function main() {
  // Define all metrics to collect
  const metrics = [
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
  ] as const

  console.log('Fetching GitHub stats...\n')

  // Helper to format error messages
  const formatError = (error: unknown) => error instanceof Error ? error.message : String(error)

  // Run metrics sequentially to avoid overwhelming the API
  const results = []

  for (const metric of metrics) {
    console.log(`Starting: ${metric.name}`)

    try {
      const result = await metric.fn()
      results.push({ name: metric.name, data: result })
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
