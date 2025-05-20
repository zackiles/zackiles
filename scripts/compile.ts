/**
 * @module compile
 * @description Compiles the project into native binaries for all platforms
 *
 * This script uses the Deno compile command to create platform-specific binaries
 * and then compresses them into archives for distribution.
 *
 * bin-path - Specifies the output directory for compiled binaries and archives.
 *                      Defaults to 'bin' if not provided.
 *                      Alias: -o
 *                      Example: deno run -A scripts/compile.ts --bin-path=./dist
 */

import { join } from '@std/path'
import { ensureDir } from '@std/fs'
import { parseArgs } from '@std/cli/parse-args'
import { compress } from './compress.ts'

// The target platforms supported by Deno compile
const TARGETS = [
  'x86_64-unknown-linux-gnu',
  'x86_64-pc-windows-msvc',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
]

// Additional files to include in the archive
const ADDITIONAL_FILES = [
  'examples/example.config..json',
  'examples/example.config.ts',
  'SETUP.md',
]

interface CompileOptions {
  binPath: string
}

async function compile({ binPath }: CompileOptions) {
  // Ensure the output directory exists
  await ensureDir(binPath)

  const entryPoint = 'build.ts'
  const resources = ['deno.json']

  console.log('Compiling binaries for all platforms...')

  for (const target of TARGETS) {
    const isWindows = target.includes('windows')
    const binaryName = `terminal-animator-${target}${isWindows ? '.exe' : ''}`
    const outputFile = join(binPath, binaryName)

    try {
      await Deno.remove(outputFile)
      console.log(`Removed existing binary: ${outputFile}`)
    } catch (error: unknown) {
      // File doesn't exist, which is fine
      if (!(error instanceof Deno.errors.NotFound)) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.warn(`Warning when removing ${outputFile}: ${errorMessage}`)
      }
    }

    console.log(`Compiling for ${target}...`)

    const cmd = new Deno.Command('deno', {
      args: [
        'compile',
        '--target', target,
        '--output', outputFile,
        '--allow-all',
        ...resources.flatMap(resource => ['--include', resource]),
        entryPoint,
      ],
    })

    const output = await cmd.output()

    if (!output.success) {
      const errorMsg = new TextDecoder().decode(output.stderr)
      console.error(`Failed to compile for ${target}: ${errorMsg}`)
      continue
    }

    console.log(`Successfully compiled for ${target}: ${outputFile}`)

    const archivePath = `${outputFile}.zip`

    try {
      try {
        await Deno.remove(archivePath)
        console.log(`Removed existing archive: ${archivePath}`)
      } catch (error: unknown) {
        if (!(error instanceof Deno.errors.NotFound)) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.warn(`Warning when removing ${archivePath}: ${errorMessage}`)
        }
      }

      // Compress the binary with additional files
      const filesToCompress = [outputFile, ...ADDITIONAL_FILES]
      await compress(filesToCompress, archivePath)
      console.log(`Compressed binary and additional files to ${archivePath}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`Failed to compress files: ${errorMessage}`)
    }
  }

  console.log('Compilation complete!')
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ['bin-path'],
    default: {
      'bin-path': 'bin',
    },
    alias: {
      o: 'bin-path',
    },
  })

  await compile({
    binPath: args['bin-path'],
  })
}
