# GitHub Metrics Collection Proposal

All metrics below are implemented in a single Deno TypeScript file named `github-stats.ts`.

## Required Dependencies

Install the following dependencies using:

```bash
deno add npm:@octokit/graphql
````

In your `github-stats.ts`, add:

```ts
import { graphql } from "npm:@octokit/graphql"
```

Ensure that your GitHub Personal Access Token is loaded via `Deno.env.get("GITHUB_PAT")`.

---

## 1. Semantic Commit Spectrum

1. Use GraphQL to fetch commit messages for each repo you own.
2. Define query:

```ts
query($login:String!,$since:DateTime!){
  user(login:$login){
    repositories(first:100, ownerAffiliations:OWNER){
      nodes{ defaultBranchRef{
        target{ ... on Commit{ history(since:$since){ nodes{ message } } } }
      } }
    }
  }
}
```

3. Flatten commit messages and extract the first verb from each.
4. Classify verbs into:

   * Creator: `add`, `create`
   * Maintainer: `update`, `bump`
   * Bugfixer: `fix`, `correct`
   * Cleaner: `remove`, `delete`
   * Refactorer: `refactor`
   * Experimenter: `test`, `try`
5. Count totals per category.
6. Output as JSON or CSV.

---

## 2. File Type Footprint

1. Use GraphQL or REST to list all repos you own.
2. For each repo:

   * Clone via `git clone --depth=1`
   * Run `git log --name-only --pretty=format:''`
   * Collect all committed filenames.
3. Extract extensions using `extname()`.
4. Count occurrences using a `Map<string, number>`.
5. Delete repo after processing.
6. Output sorted extension counts.

---

## 3. Code Velocity Delta

1. Define two time windows:

   * Current 30 days
   * Same 30-day range from the previous year
2. Use this GraphQL query for each window:

```ts
query($login:String!,$since:DateTime!){
  user(login:$login){
    repositories(first:100, ownerAffiliations:OWNER){
      nodes{ defaultBranchRef{
        target{ ... on Commit{ history(since:$since){ nodes{ additions deletions } } } }
      } }
    }
  }
}
```

3. Sum additions and deletions per window.
4. Compute delta: `now_total - last_year_total`
5. Output a delta report with both totals.

---

## 4. Creator Tag Signature

1. Use this GraphQL query to get topics from your own repos:

```ts
query($login:String!){
  user(login:$login){
    repositories(first:100, ownerAffiliations:OWNER){
      nodes{ repositoryTopics(first:10){ nodes{ topic{name} } } }
    }
  }
}
```

2. Extract topic names.
3. Count frequencies using a map.
4. Sort and return top tags.

---

## 5. Starred Topic Affinity

1. Use paginated GraphQL to fetch all starred repos with topics:

```ts
query($after:String){
  viewer{
    starredRepositories(first:50, after:$after){
      pageInfo{ hasNextPage endCursor }
      nodes{ repositoryTopics(first:10){ nodes{ topic{name} } } }
    }
  }
}
```

2. Loop through pages.
3. Extract all topic names.
4. Count and sort by frequency.

---

## 6. Star Power Picks

1. Use paginated GraphQL to fetch starred repos and their star counts:

```ts
query($after:String){
  viewer{
    starredRepositories(first:50, after:$after){
      pageInfo{ hasNextPage endCursor }
      nodes{ nameWithOwner stargazerCount url }
    }
  }
}
```

2. Aggregate all repos.
3. Sort by `stargazerCount` descending.
4. Return top N with name and URL.

---

## 7. Niche Scout Score

1. Reuse the stargazer counts collected in Metric 6.
2. Calculate the median star count of your starred repos.
3. Define a global median benchmark (e.g. 15 stars).
4. Compare and output:

```json
{
  "userMedian": 23,
  "globalMedian": 15,
  "score": "discovery-oriented"
}
```

## 8. Total Lines of Code Changed (All-Time)

1. Use this GraphQL query to retrieve all your repositories:

```ts
query($login:String!, $after:String){
  user(login:$login){
    repositories(first:100, after:$after, ownerAffiliations:OWNER, privacy:PRIVATE){
      pageInfo{ hasNextPage endCursor }
      nodes{
        name
        defaultBranchRef {
          target {
            ... on Commit {
              history(first:100) {
                nodes {
                  additions
                  deletions
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }
      }
    }
  }
}
````

2. For each repository:

   * Traverse all commits via paginated `history(after: $cursor)`
   * Sum all `additions + deletions`
   * Store cumulative totals

3. If desired, also repeat for `privacy:PUBLIC` or omit to include both.

4. Accumulate the total additions and deletions across all repos.

5. Output:

```json
{
  "total_additions": 123456,
  "total_deletions": 98765,
  "net_change": 24691
}
```
