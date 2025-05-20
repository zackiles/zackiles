/**
 * @module composer
 *
 * Provides a fluent interface for building terminal animation configurations.
 * This module exports the Composer class which allows for a chainable API to create
 * config objects compatible with the terminal animator.
 *
 * @example
 * ```ts
 * import { Composer } from './composer.ts'
 *
 * const config = new Composer({
 *   width: 800,
 *   height: 200,
 *   colors: {
 *     bg: "black",
 *     terminalLines: "#00FF00"
 *   }
 * })
 * .step
 *   .terminalLines(["file1.txt", "file2.txt"])
 *   .shellPrompt({ user: "zack", host: "machine", symbol: ":~$" })
 *   .timing({ start: 1, perChar: 0.2, hold: 2 })
 *   .command("ls")
 *   .done
 * .toJSON()
 * ```
 *
 * @see {@link Config} for the output configuration format
 * @see {@link TerminalStep} for the step configuration structure
 */
import type { Config, ShellPrompt, TerminalStep } from './types.ts'
import { defaultConfig, defaultStep } from './defaults.ts'

/**
 * Builder class for creating terminal animation steps with a fluent interface
 *
 * @internal
 */
class StepBuilder {
  private step: Partial<TerminalStep> = {
    terminalLines: defaultStep.terminalLines,
    command: defaultStep.command,
    shellPrompt: defaultStep.shellPrompt,
    timing: defaultStep.timing,
  }

  constructor(private composer: Composer) {}

  /**
   * Sets the terminal lines to display for this step
   *
   * @param lines - Array of text lines to display in the terminal
   * @returns StepBuilder instance for method chaining
   */
  terminalLines(lines: string[]): StepBuilder {
    this.step.terminalLines = lines
    return this
  }

  /**
   * Sets the shell prompt configuration for this step
   *
   * @param prompt - Shell prompt configuration with user, host and symbol
   * @returns StepBuilder instance for method chaining
   */
  shellPrompt(prompt: ShellPrompt): StepBuilder {
    this.step.shellPrompt = prompt
    return this
  }

  /**
   * Sets the timing configuration for this step
   *
   * @param timing - Timing settings for animation
   * @returns StepBuilder instance for method chaining
   */
  timing(timing: TerminalStep['timing']): StepBuilder {
    this.step.timing = timing
    return this
  }

  /**
   * Sets the command to be displayed for this step
   *
   * @param cmd - Command text to display
   * @returns StepBuilder instance for method chaining
   */
  command(cmd: string): StepBuilder {
    this.step.command = cmd
    return this
  }

  /**
   * Sets the position configuration for this step
   *
   * @param position - Position settings for the prompt and command
   * @returns StepBuilder instance for method chaining
   */
  position(position: TerminalStep['position']): StepBuilder {
    this.step.position = position
    return this
  }

  /**
   * Completes this step configuration and returns to the Composer
   *
   * @returns Composer instance for continuing the configuration
   */
  get done(): Composer {
    // Add current step to the composer's steps list
    this.composer.addStep(this.step as TerminalStep)
    // Return composer for continued chaining
    return this.composer
  }
}

/**
 * Composer class for building terminal animation configurations
 * with a fluent, chainable API
 */
class Composer {
  private config: Partial<Config>

  /**
   * Creates a new Composer instance with optional initial configuration
   *
   * @param initialConfig - Optional partial configuration to start with
   */
  constructor(initialConfig: Partial<Config> = {}) {
    // Set default values
    this.config = {
      width: defaultConfig.width,
      height: defaultConfig.height,
      fontFamily: defaultConfig.fontFamily,
      fontSize: defaultConfig.fontSize,
      colors: {
        ...defaultConfig.colors,
      },
      charWidth: defaultConfig.charWidth,
      steps: [],
      ...initialConfig,
    }
  }

  /**
   * Adds a terminal step to the configuration
   *
   * @param step - The step configuration to add
   * @returns Composer instance for method chaining
   */
  addStep(step: TerminalStep): Composer {
    if (!this.config.steps) {
      this.config.steps = []
    }
    this.config.steps.push(step)
    return this
  }

  /**
   * Starts building a new terminal step
   *
   * @returns StepBuilder instance to configure the step
   */
  get step(): StepBuilder {
    return new StepBuilder(this)
  }

  /**
   * Converts the built configuration to a JSON object
   *
   * @returns The complete Config object
   */
  toJSON(): Config {
    return this.config as Config
  }

  /**
   * Saves the configuration to a JSON file
   *
   * @param path - Path where the file should be saved
   * @returns Promise that resolves when the file is written
   */
  async saveToFile(path: string): Promise<void> {
    const json = JSON.stringify(this.config, null, 2)
    await Deno.writeTextFile(path, json)
  }
}

export { Composer, StepBuilder }
