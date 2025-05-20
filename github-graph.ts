#!/usr/bin/env -S deno run -A

/**
 * Generates an isometric 3D visualization of a GitHub user's contribution graph.
 *
 * This script fetches a user's GitHub contribution data via the GraphQL API and
 * creates an interactive HTML visualization using the Obelisk library.
 *
 * @module github-graph
 * @requires npm:@octokit/graphql
 * @requires npm:@storiny/obelisk
 * @requires @std/fs
 * @requires @std/dotenv/load
 * @requires playwright
 *
 * @example
 * ```bash
 * # First set up your GitHub token in .env
 * echo "GITHUB_TOKEN=your_github_token" > .env
 *
 * # Run with required flags
 * deno run -A github-graph.ts --gh-user octocat --output-directory ./output
 * ```
 *
 * @remarks
 * Required flags:
 * - --gh-user: GitHub username to fetch contributions for
 * - --output-directory: Directory to save the generated files
 *
 * Required permissions:
 * - --allow-net: To fetch data from GitHub's API
 * - --allow-env: To read GITHUB_TOKEN from environment
 * - --allow-read: To read .env file
 * - --allow-write: To write output HTML file
 *
 * @throws {Error} If GITHUB_TOKEN is not set in environment
 * @throws {Error} If required flags are missing
 */

// dependencies:
// deno add npm:@octokit/graphql
// deno add npm:@storiny/obelisk
// deno add jsr:@std/fs
// deno add npm:playwright

import '@std/dotenv/load'
import { graphql } from 'npm:@octokit/graphql'
import { writeTextFile } from '@std/fs/unstable-write-text-file'
import { parseArgs } from '@std/cli'
import { join } from '@std/path'
import { ensureDir } from '@std/fs'
import { dedent } from '@qnighy/dedent'
import { chromium } from 'npm:playwright'

const htmlFileName = 'graph.html'
const pngFileName = 'graph.png'

interface ContributionDay {
  date: string
  contributionCount: number
  color: string
}

interface ContributionWeek {
  contributionDays: ContributionDay[]
}

interface GraphQLResponse {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        weeks: ContributionWeek[]
      }
    }
  }
}

async function saveScreenshot(html: string, outputPath: string) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 800 },
    })
    await page.setContent(html)

    // Wait for the canvas element and Obelisk to initialize
    await page.waitForSelector('canvas#graph')
    await page.waitForFunction(
      `() => {
      const canvas = document.querySelector('canvas#graph');
      return canvas && canvas.getContext('2d')?.getImageData(0, 0, 1, 1)?.data.some(x => x !== 0);
    }`,
      { timeout: 5000 },
    )

    // Additional small delay to ensure all cubes are rendered
    await page.waitForTimeout(1000)

    await page.screenshot({
      path: outputPath,
      clip: {
        x: 0,
        y: 0,
        width: 1400,
        height: 800,
      },
    })
    console.log(`Screenshot saved to ${outputPath}`)
  } finally {
    await browser.close()
  }
}

async function main() {
  const { 'gh-user': ghUser, 'output-directory': outputDir } = parseArgs(Deno.args, {
    string: ['gh-user', 'output-directory'],
    default: {
      'output-directory': Deno.cwd(),
    },
  })

  if (!ghUser) {
    console.error('Required flag --gh-user is missing')
    Deno.exit(1)
  }

  const token = Deno.env.get('GITHUB_TOKEN')
  if (!token) {
    console.error('GITHUB_TOKEN environment variable is not set')
    Deno.exit(1)
  }

  await ensureDir(outputDir)

  const to = new Date()
  const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate())

  const response = await graphql<GraphQLResponse>(
    `
    query userContributions($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
                color
              }
            }
          }
        }
      }
    }
    `,
    {
      login: ghUser,
      from: from.toISOString(),
      to: to.toISOString(),
      headers: { authorization: `token ${token}` },
    },
  )

  const weeks = response.user.contributionsCollection.contributionCalendar.weeks
  const flatDays = weeks.flatMap((w) => w.contributionDays)
  const maxCount = Math.max(...flatDays.map((d) => d.contributionCount))

  const html = dedent`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>GitHub Contributions Isometric Graph</title>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          background: #000;
          color: #00FF00;
          font-family: "Courier New", monospace;
          width: 100%;
          min-height: 100vh;
        }
        body {
          padding-left: 20px;
          box-sizing: border-box;
          background: rgba(0, 255, 0, 0.05);
        }
        .container {
          max-width: 820px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .graph-wrapper {
          width: 100%;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 8px;
          padding: 10px;
          box-sizing: border-box;
        }
        canvas {
          width: 100%;
          height: auto;
          display: block;
        }
        .stats {
          text-align: left;
          padding: 20px;
          border: 1px solid #00FF00;
          border-radius: 4px;
          font-size: 12px;
          line-height: 1.4;
          background: rgba(0, 0, 0, 0.9);
          width: fit-content;
          position: relative;
          margin-top: -30px;
          margin-left: 20px;
          z-index: 10;
          box-shadow: 0 0 20px rgba(0, 255, 0, 0.1);
        }
        .stats-header {
          color: #00ffff;
          margin-bottom: 8px;
          font-weight: bold;
          font-size: 14px;
        }
        .stats-value {
          color: #ffaa00;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="graph-wrapper">
          <canvas id="graph" width="1400" height="600"></canvas>
        </div>
        <div id="stats" class="stats"></div>
      </div>
      <script type="module">
        import { Point, Point3D, PixelView, CubeDimension, CubeColor, Cube } from "https://esm.sh/@storiny/obelisk"

        const contributionData = ${JSON.stringify(weeks)};
        const maxContributions = ${maxCount};
        const days = contributionData.flatMap(w => w.contributionDays);
        const totalContributions = days.reduce((sum, day) => sum + day.contributionCount, 0);
        const daysWithContributions = days.filter(d => d.contributionCount > 0).length;
        const avgDaily = (totalContributions / days.length).toFixed(1);

        let currentStreak = 0;
        let longestStreak = 0;
        let streak = 0;

        // Calculate streaks going backwards (most recent first)
        for (let i = days.length - 1; i >= 0; i--) {
          if (days[i].contributionCount > 0) {
            streak++;
            if (i === days.length - 1) currentStreak = streak;
            longestStreak = Math.max(longestStreak, streak);
          } else {
            streak = 0;
          }
        }

        // Update stats display
        document.getElementById('stats').innerHTML = \`
          <div class="stats-header">/CONTRIBUTION_STATS</div>
          <div>Total: <span class="stats-value">\${totalContributions}</span></div>
          <div>Active Days: <span class="stats-value">\${daysWithContributions}</span></div>
          <div>Daily Average: <span class="stats-value">\${avgDaily}</span></div>
          <div>Most in One Day: <span class="stats-value">\${maxContributions}</span></div>
          <div>Current Streak: <span class="stats-value">\${currentStreak} days</span></div>
          <div>Longest Streak: <span class="stats-value">\${longestStreak} days</span></div>
        \`;

        const SIZE = 16;
        const MAX_HEIGHT = 100;
        const GH_OFFSET = 14;

        const canvas = document.getElementById("graph");
        const view = new PixelView(canvas, new Point(200, 100));

        let transformX = GH_OFFSET;

        for (const week of contributionData) {
          const x = transformX / (GH_OFFSET + 1);
          transformX += GH_OFFSET;

          let transformY = 0;

          for (const day of week.contributionDays) {
            const y = transformY / GH_OFFSET;
            transformY += 13;

            let cubeHeight = 3;
            if (maxContributions > 0) {
              cubeHeight += Math.floor((MAX_HEIGHT / maxContributions) * day.contributionCount);
            }

            const dim = new CubeDimension(SIZE, SIZE, cubeHeight);
            const colorValue = parseInt(day.color.replace("#", ""), 16);
            const color = new CubeColor().getByHorizontalColor(colorValue);

            const cube = new Cube(dim, color, false);
            const p3d = new Point3D(SIZE * x, SIZE * y, 0);

            view.renderObject(cube, p3d);
          }
        }
      </script>
    </body>
    </html>
  `

  const outputPath = join(outputDir, htmlFileName)
  await writeTextFile(outputPath, html).catch(console.error)
  console.log(`Generated visualization at ${outputPath}`)

  // Save PNG screenshot
  const pngPath = join(outputDir, pngFileName)
  await saveScreenshot(html, pngPath)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    Deno.exit(1)
  })
}
