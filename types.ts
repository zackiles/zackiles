/**
 * Types for configuring a terminal animation that simulates command execution.
 * The animation displays a virtual terminal with a shell prompt, typed commands,
 * and their output, creating a realistic terminal session playback.
 */

/**
 * Configures the shell prompt display at the bottom of the terminal.
 * Creates the familiar username@hostname:path$ format seen in most shells.
 * Example: "user@host:~/path$"
 */
type ShellPrompt = {
  /** Username displayed in prompt */
  user: string
  /** Hostname displayed in prompt */
  host: string
  /** Prompt symbol (e.g. $, >, #) */
  symbol: string
  /** Optional working directory path */
  path?: string
}

/**
 * Represents a single step in the terminal animation sequence.
 * Each step shows terminal output, displays a prompt, and types out a command.
 * Steps play in sequence, with configurable timing and positioning.
 */
type TerminalStep = {
  /** Lines of terminal output to display above the prompt */
  terminalLines: string[]
  /** Shell prompt configuration shown at the input line */
  shellPrompt: ShellPrompt
  /** Command to type out after the prompt */
  command: string
  /** Animation timing configuration */
  timing: {
    /** Time in seconds before command starts typing */
    start: number
    /** Time in seconds per character when typing command */
    perChar: number
    /** Time in seconds to hold after command finishes typing */
    hold: number
    /** Optional fade-in duration in seconds for smooth transitions */
    fadeIn?: number
  }
  /** Optional positioning overrides for fine-tuning layout */
  position?: {
    /** X coordinate for prompt start (default: 20) */
    promptX?: number
    /** X coordinate for command start (default: promptX + promptWidth + 5) */
    commandX?: number
  }
}

/**
 * Supported output formats for the animation.
 * - html: Interactive webpage with embedded or linked SVG
 * - svg: Standalone SVG file with embedded animations
 * - gif: Animated GIF for compatibility
 */
type OutputType = 'html' | 'svg' | 'gif'

/**
 * Main configuration for the terminal animation.
 * Controls the visual appearance, timing, and content of the animated terminal.
 * The animation simulates a terminal session with commands being typed and executed.
 */
type Config = {
  /** SVG viewport width in pixels */
  width: number
  /** SVG viewport height in pixels */
  height: number
  /** Font family for all text */
  fontFamily: string
  /** Font size in pixels */
  fontSize: number
  /** Whether animation should loop back to start */
  loop: boolean
  /** Base name for output files */
  name?: string
  /** Directory to save output files */
  outputDirectory?: string
  /** Output formats to generate */
  outputTypes?: OutputType[]
  /**
   * When true, embeds the SVG content directly in the HTML.
   * When false, links to the SVG file from HTML.
   * CSS animations are always embedded in the SVG regardless.
   */
  embed?: boolean
  /** Whether to use CSS animations (always true) */
  useCss?: boolean
  /** Color scheme for terminal elements */
  colors: {
    /** Terminal background color */
    bg: string
    /** Color for terminal output lines */
    terminalLines: string
    /** Color for username in prompt */
    user: string
    /** Color for hostname in prompt */
    host: string
    /** Color for path in prompt */
    path?: string
    /** Color for prompt symbol */
    symbol: string
    /** Color for typed commands */
    command: string
  }
  /** Width of a single character in pixels for monospace layout */
  charWidth: number
  /** Sequence of animation steps to render */
  steps: TerminalStep[]
}

export type { Config, OutputType, ShellPrompt, TerminalStep }
