/**
 * Feature flags for agent architecture rollout.
 * OFF = 100% legacy orchestrator behavior.
 */

export function isAgentArchV2Enabled(env = process.env) {
  const v = env.AGENT_ARCH_V2_ENABLED;
  if (v === undefined || v === null || v === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export function architectureMode(env = process.env) {
  return isAgentArchV2Enabled(env) ? 'v2_harness' : 'legacy';
}

export default { isAgentArchV2Enabled, architectureMode };
