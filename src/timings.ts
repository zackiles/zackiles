// Animation timing defaults - internal engine constants not user-configurable
export default {
  // Animation sequence timing - controls flow between animation steps
  // WARNING: Interacts with user's step.timing.hold setting. Changing this value affects
  // the total animation duration and transitions between steps.
  STEP_TRANSITION: 0.5, // Fixed transition time between steps in seconds (separate from user's hold time)

  // WARNING: These three timing constants affect total animation duration calculation in computeTotalAnimationTime().
  // Changing these values will directly impact the perceived animation length and loop behavior.
  LOOP_EXTRA_TIME: 0, // Additional display time at the end of loop animations for better user experience
  NON_LOOP_EXTRA_TIME: 0.5, // Additional time at the end for non-looping animations before stopping
  LAST_STEP_EXTRA_TIME: 1.0, // Extra pause on the final step when in loop mode before restarting

  // Animation effects timing (internal SVG animation durations)
  // Note: This is different from the user's perChar setting which controls delay between characters.
  // This controls how long each character's fade-in animation takes to complete.
  // WARNING: Works in conjunction with user's perChar setting. This value should remain small
  // relative to perChar for smooth character appearance animations.
  CHAR_ANIMATION_DURATION: 0.01, // Duration of single character animation

  // Loop animation timing - controls the precise sequence of loop restart events
  // WARNING: The following timing constants are interdependent. Changing one may require
  // adjusting the others to maintain smooth loop transitions. They control the precise
  // sequence and timing of animation reset events when looping.
  LOOP_TRIGGER_DURATION: 0.01, // Duration of invisible animation that triggers the loop restart sequence
  RESET_TERMINAL_DURATION: 0.1, // How long it takes to reset terminal content visibility when looping
  RESET_PROMPT_DURATION: 0.01, // How long it takes to reset prompt visibility during loop transition
  LOOP_DELAY: 0.1, // Small delay between end of one cycle and beginning of next for smoother looping

  // NEW: Small delay for internal event sequencing during loop reset
  EPSILON_DELAY: 0.05, // Small delay to ensure event propagation for cycle restarts

  // GIF generation - technical parameters for output quality
  // WARNING: Increasing GIF_FPS will create smoother animations but increase file size.
  GIF_FPS: 30, // Frames per second for GIF output (higher values = smoother but larger file size)
  SCREENSHOT_INITIAL_DELAY: 100, // Initial delay in ms before capturing screenshots for test/preview images
}
