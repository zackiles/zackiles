# GitHub Stats Generator

This module collects and analyzes your GitHub activity to generate insightful statistics about your development patterns, preferences, and interests. It uses the GitHub GraphQL API to fetch data efficiently while respecting rate limits.

## Table of Contents

- [GitHub Stats Generator](#github-stats-generator)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [State Management](#state-management)
  - [Available Metrics](#available-metrics)
    - [Semantic Commit Spectrum](#semantic-commit-spectrum)
    - [File Type Footprint](#file-type-footprint)
    - [Code Velocity Delta](#code-velocity-delta)
    - [Creator Tag Signature](#creator-tag-signature)
    - [Starred Topic Affinity](#starred-topic-affinity)
    - [Star Power Picks](#star-power-picks)
    - [Niche Scout Score](#niche-scout-score)
    - [Total Lines of Code Changed](#total-lines-of-code-changed)
  - [Performance Considerations](#performance-considerations)
    - [GitHub API Rate Limits](#github-api-rate-limits)
    - [Execution Time](#execution-time)
  - [Usage](#usage)

## Overview

The GitHub Stats Generator analyzes your GitHub activity to generate metrics that provide insights into your development patterns. It uses an incremental state-based approach to minimize API calls and improve performance across multiple runs.

The module uses:

- GitHub GraphQL API for efficient data fetching
- Persistent state management for incremental updates
- Rate limit handling with exponential backoff
- Multi-step processing for complex metrics

## State Management

The module maintains state in a JSON file (`github_stats_state.json`) that contains:

- The last update timestamp for each metric
- Cached results from previous runs
- Cursors for pagination in the GitHub API
- Accumulated data for long-running operations

This state-based approach allows:

1. **Incremental Updates**: Only fetch new data since the last run
2. **Resumable Operations**: Continue from where you left off if interrupted
3. **Efficient API Usage**: Respect GitHub's rate limits by minimizing redundant calls
4. **Historical Analysis**: Maintain a record of your GitHub activity over time

## Available Metrics

### Semantic Commit Spectrum

**What it measures**: Analyzes your commit messages to categorize your development style.

**Data Collection**:

- Fetches commit messages from your repositories
- Extracts the first verb from each message
- Categorizes verbs into buckets (creator, maintainer, bugfixer, etc.)

**State Management**:

- Tracks the last time commits were fetched
- Stores the running counts by category
- Only processes commits newer than the last fetch

**Sample Output**:

```json
{
  "totalCommits": 534,
  "verbSpectrum": {
    "creator": 156,
    "maintainer": 203,
    "bugfixer": 97,
    "cleaner": 34,
    "refactorer": 28,
    "experimenter": 15,
    "other": 1
  }
}
```

### File Type Footprint

**What it measures**: Analyzes the file types you work with most frequently.

**Data Collection**:

- Clones a sample of your repositories (limited to 5 to avoid long execution time)
- Uses `git ls-files` to list all files
- Extracts and counts file extensions

**State Management**:

- Stores the last scan time
- Caches extension counts
- Refreshes data once a day for accuracy

**Sample Output**:

```json
{
  "totalUniqueExtensions": 18,
  "extensionCounts": {
    ".ts": 243,
    ".js": 156,
    ".md": 52,
    ".json": 34,
    ".html": 23
  }
}
```

### Code Velocity Delta

**What it measures**: Compares your current coding activity to the same period last year.

**Data Collection**:

- Fetches commit stats (additions/deletions) for the current and past periods
- Aggregates stats by day
- Calculates period-over-period delta

**State Management**:

- Stores daily aggregated stats
- Tracks the last aggregated date
- Only fetches new data since the last aggregation
- Prunes data older than 13 months

**Sample Output**:

```json
{
  "current": {
    "additions": 12450,
    "deletions": 7823,
    "total": 20273
  },
  "lastYear": {
    "additions": 9876,
    "deletions": 5432,
    "total": 15308
  },
  "delta": 4965
}
```

### Creator Tag Signature

**What it measures**: Analyzes the topics you use on your repositories to identify themes in your work.

**Data Collection**:

- Fetches repository topics from your GitHub repositories
- Counts the frequency of each topic
- Ranks topics by usage

**State Management**:

- Stores topic data per repository with update timestamps
- Only refreshes data for repositories that have been updated
- Updates aggregated counts when repositories change

**Sample Output**:

```json
{
  "topTags": {
    "typescript": 8,
    "react": 6,
    "open-source": 5,
    "node": 4,
    "api": 3
  },
  "totalUniqueTags": 27
}
```

### Starred Topic Affinity

**What it measures**: Analyzes topics from repositories you've starred to identify your interests.

**Data Collection**:

- Fetches topics from repositories you've starred
- Counts the frequency of each topic
- Ranks topics by frequency

**State Management**:

- Stores pagination cursor for resumable operations
- Maintains a running count of topic occurrences
- Performs full scans weekly
- Can resume from interruptions

**Sample Output**:

```json
{
  "topStarredTags": {
    "machine-learning": 12,
    "typescript": 8,
    "react": 7,
    "deep-learning": 6,
    "javascript": 5
  },
  "totalUniqueStarredTags": 156
}
```

### Star Power Picks

**What it measures**: Identifies the most popular repositories you've starred.

**Data Collection**:

- Fetches all repositories you've starred
- Ranks them by star count
- Extracts the top 10

**State Management**:

- Stores the full list of starred repositories
- Tracks pagination cursors for resumable operations
- Refreshes data daily
- In-memory caching for same-session reuse

**Sample Output**:

```json
{
  "topStarredRepos": [
    {
      "nameWithOwner": "microsoft/TypeScript",
      "stargazerCount": 83000,
      "url": "https://github.com/microsoft/TypeScript"
    },
    ...
  ],
  "totalStarredRepos": 427
}
```

### Niche Scout Score

**What it measures**: Determines if you tend to star popular repositories or discover lesser-known gems.

**Data Collection**:

- Uses data from Star Power Picks
- Calculates the median star count of your top starred repositories
- Compares against a global benchmark (15 stars)

**State Management**:

- Shares state with Star Power Picks
- Calculations are derived from Star Power Picks data

**Sample Output**:

```json
{
  "userMedian": 34,
  "globalMedian": 15,
  "score": "mainstream-oriented"
}
```

### Total Lines of Code Changed

**What it measures**: Calculates the total volume of code you've contributed.

**Data Collection**:

- Fetches commit history across all your repositories
- Sums additions and deletions
- Calculates net change

**State Management**:

- Tracks each repository's last processed commit
- Stores pagination cursors for repository list and commit history
- Only processes new commits since last scan
- Refreshes weekly for efficiency

**Sample Output**:

```json
{
  "total_additions": 157892,
  "total_deletions": 98765,
  "net_change": 59127
}
```

## Performance Considerations

### GitHub API Rate Limits

The GitHub GraphQL API has rate limits that this module respects:

- 5,000 points per hour (each query costs points based on complexity)
- Secondary rate limits may apply for rapid, complex queries

This module implements strategies to handle rate limits:

1. **Exponential Backoff**: Automatically retries requests with increasing delays
2. **Jitter**: Adds randomness to retry intervals to prevent thundering herd problems
3. **Request Batching**: Combines related queries when possible
4. **State-Based Incremental Fetching**: Only fetches new data since the last run

### Execution Time

Some metrics can take a long time to compute:

- **Star Power Picks & Starred Topic Affinity**: Requires paginating through all starred repositories
- **Total Lines of Code Changed**: Processes commit history across all repositories
- **File Type Footprint**: Clones repositories to analyze file types

The state management system enables these operations to be:

- Resumed if interrupted
- Split across multiple runs
- Cached when recently computed

## Usage

1. **Environment Setup**:
   - Create a `.env` file with your GitHub token:
     ```
     GITHUB_TOKEN=your_github_personal_access_token
     ```
   - The token needs `repo` and `read:user` scopes

2. **Running the Script**:
   ```bash
   deno run -A github-stats.ts
   ```

3. **Understanding Output**:
   - Results are printed to the console
   - State is saved to `github_stats_state.json`

4. **Recommendations**:
   - Run the script daily or weekly for incremental updates
   - The first run will take longer as it builds the initial state
   - Subsequent runs will be much faster as they only fetch new data
