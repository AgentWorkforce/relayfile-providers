/**
 * 011-nango-scaffold.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Scaffold @relayfile/provider-nango and the initial NangoProvider package surface.
 * Establish package metadata, core files, provider skeleton, and baseline tests.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const SDK_PACKAGE = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile/packages/relayfile-sdk';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';
const TYPES_WORKFLOW = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile/workflows/001-adapter-plugin-types.ts';

async function main() {
  const result = await workflow('011-nango-scaffold')
    .description('Scaffold the Nango provider package and provider entrypoints')
    .pattern('dag')
    .channel('wf-relayfile-nango-scaffold')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans the Nango provider scaffold',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Writes the provider scaffold files',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews scaffold quality and spec fit',
      cwd: NANGO_REPO,
    })

    .step('plan-scaffold', {
      agent: 'architect',
      task: `Read ${SPEC}, ${TYPES_WORKFLOW}, ${SDK_PACKAGE}/src/index.ts, and ${NANGO_REPO}/package.json.

Plan the initial scaffold for @relayfile/provider-nango:
- package.json and tsconfig alignment
- src/index.ts, src/nango-provider.ts, src/types.ts, src/errors.ts
- baseline method signatures for proxy, healthCheck, handleWebhook, listConnections
- test layout under src/__tests__
- any exports needed for later workflows 012-018

List files, purpose, and sequencing.
Keep output under 50 lines.
Print NANGO_SCAFFOLD_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_SCAFFOLD_PLAN_COMPLETE' },
    })

    .step('init-package', {
      agent: 'builder',
      dependsOn: ['plan-scaffold'],
      task: `At ${NANGO_REPO}, align the package scaffold for @relayfile/provider-nango.

Create or update:
- package.json with name @relayfile/provider-nango and build/test/lint scripts
- tsconfig.json for strict TS, src root, dist output
- src/ and src/__tests__/ directories

Preserve existing lockfiles when possible.
Only edit scaffold files and package metadata.`,
      verification: { type: 'exit_code' },
    })

    .step('write-core-files', {
      agent: 'builder',
      dependsOn: ['init-package'],
      task: `Using {{steps.plan-scaffold.output}}, create the core provider files in ${NANGO_REPO}.

Write:
- src/nango-provider.ts with NangoProvider skeleton and TODO-safe method stubs
- src/types.ts for config, proxy payloads, webhook payloads, and connection types
- src/errors.ts for provider-specific error classes
- src/index.ts barrel exports

Keep the code ready for workflows 012-018 to extend.`,
      verification: { type: 'exit_code' },
    })

    .step('write-scaffold-tests', {
      agent: 'builder',
      dependsOn: ['write-core-files'],
      task: `Create baseline tests for the scaffold in ${NANGO_REPO}/src/__tests__/nango-provider.test.ts.

Cover:
- constructor and default baseUrl
- exported provider name
- method presence for proxy, healthCheck, handleWebhook, listConnections
- exported types and error classes resolve from src/index.ts

Use the repo's existing test tooling if present.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-scaffold-files', {
      type: 'deterministic',
      dependsOn: ['write-scaffold-tests'],
      command: `test -f ${NANGO_REPO}/src/index.ts && test -f ${NANGO_REPO}/src/nango-provider.ts && test -f ${NANGO_REPO}/src/types.ts && test -f ${NANGO_REPO}/src/errors.ts && test -f ${NANGO_REPO}/src/__tests__/nango-provider.test.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/index.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-scaffold-files'],
      task: `Review the scaffold in ${NANGO_REPO}.

Check:
- package layout matches ${SPEC}
- the provider skeleton is ready for workflows 012-018
- exports are coherent and minimal
- tests match the scaffold contract
- no path or package-name drift from Relayfile conventions

Keep output under 50 lines.
Print NANGO_SCAFFOLD_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_SCAFFOLD_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`011 Nango Scaffold: ${result.status}`);
}

main().catch(console.error);
