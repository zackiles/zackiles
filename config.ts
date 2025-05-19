/**
 * Terminal animator configuration
 *
 * Exports the same configuration as config.json, but built using the Composer API.
 */
import { Composer } from './composer.ts'

// Create configuration using the Composer fluent API
const composer = new Composer({
  width: 800,
  height: 200,
  fontFamily: 'Courier New, monospace',
  fontSize: 18,
  colors: {
    bg: 'black',
    terminalLines: '#00FF00',
    user: '#00ffff',
    host: '#ffaa00',
    path: '#ffaa00',
    symbol: '#ffffff',
    command: '#ffffff',
  },
  charWidth: 11,
})
  .step
  .terminalLines([
    '/PROJECTS',
    'deno-kit',
    'luna-ai',
    'cursor-config',
    'cursor-workbench',
    'cdp-proxy-interceptor',
    'git-vault',
  ])
  .shellPrompt({
    user: 'zack',
    host: 'machine',
    symbol: ':~$',
  })
  .command('whois')
  .timing({
    start: 2,
    perChar: 0.2,
    hold: 2,
  })
  .done
  .step
  .terminalLines([
    '/COUNTRY & CITY',
    'Canada',
    '',
    '/LANGUAGES',
    'Typescript, Go, Rust',
  ])
  .shellPrompt({
    user: 'zack',
    host: 'machine',
    symbol: ':~$',
  })
  .command('clear')
  .timing({
    start: 6,
    perChar: 0.2,
    hold: 3,
  })
  .done

// Export the configuration object
export default composer.toJSON()
