import assert from "node:assert/strict";
import test from "node:test";

import {
  activateWorkflow,
  deactivateWorkflow,
  deleteExecution,
  executeWorkflow,
  getExecution,
  getWorkflow,
  listExecutions,
  listNodeTypes,
  listWorkflows,
  N8nApiError,
} from "../index.js";
import type { N8nApiRequestOptions, N8nRequestExecutor } from "../index.js";

function createExecutor(responder: (options: N8nApiRequestOptions) => unknown): N8nRequestExecutor {
  return {
    async request<T>(options: N8nApiRequestOptions) {
      return responder(options) as T;
    },
    async requestWithFallback<T>(candidates: readonly N8nApiRequestOptions[]) {
      let last: unknown;
      for (const candidate of candidates) {
        try {
          return responder(candidate) as T;
        } catch (error) {
          last = error;
        }
      }
      throw last;
    },
  };
}

test("workflow helpers normalize list and detail responses", async () => {
  const queries: Array<N8nApiRequestOptions["query"]> = [];
  const executor = createExecutor((options) => {
    queries.push(options.query);
    if (options.path === "/workflows") {
      return {
        data: [
          {
            id: "wf-1",
            name: "Sync GitHub",
            active: true,
            tags: [{ name: "github" }],
            nodes: [],
            connections: {},
          },
        ],
        nextCursor: "wf-next",
      };
    }

    return {
      id: "wf-1",
      name: "Sync GitHub",
      active: true,
      tags: [{ name: "github" }],
      nodes: [],
      connections: {},
    };
  });

  const workflows = await listWorkflows(executor, {
    active: true,
    cursor: "wf-cursor",
    limit: 5,
    tags: ["github"],
  });
  const workflow = await getWorkflow(executor, "wf-1");

  assert.equal(workflows.data[0]!.tags[0], "github");
  assert.equal(workflows.nextCursor, "wf-next");
  assert.equal(workflow.id, "wf-1");
  assert.deepEqual(queries[0], { active: true, cursor: "wf-cursor", limit: 5, tags: "github" });
});

test("workflow mutations and node discovery use fallbacks cleanly", async () => {
  const calls: string[] = [];
  const executor = createExecutor((options) => {
    calls.push(`${options.method} ${options.path}`);

    if (options.path.endsWith("/activate")) {
      throw new Error("activate fallback");
    }

    if (options.path === "/node-types") {
      return {
        data: [
          {
            name: "n8n-nodes-base.github",
            displayName: "GitHub",
            group: ["input"],
          },
        ],
      };
    }

    if (options.path.includes("/execute") || options.path.includes("/run")) {
      return { id: "exec-1", status: "success" };
    }

    return {
      id: "wf-1",
      name: "Sync GitHub",
      active: !options.path.endsWith("/deactivate"),
      tags: [],
      nodes: [],
      connections: {},
    };
  });

  const activated = await activateWorkflow(executor, "wf-1");
  const deactivated = await deactivateWorkflow(executor, "wf-1");
  const execution = await executeWorkflow(executor, "wf-1", {
    data: { dryRun: true },
  });
  const nodeTypes = await listNodeTypes(executor);

  assert.equal(activated.id, "wf-1");
  assert.equal(deactivated.id, "wf-1");
  assert.equal(execution.id, "exec-1");
  assert.equal(nodeTypes[0]!.name, "n8n-nodes-base.github");
  assert.ok(calls.some((call) => call === "POST /workflows/wf-1/activate"));
  assert.ok(calls.some((call) => call === "PATCH /workflows/wf-1"));
});

test("executeWorkflow retries alternate endpoint and body shapes on compatible API errors", async () => {
  const calls: string[] = [];
  const executor = createExecutor((options) => {
    calls.push(`${options.method} ${options.path} ${JSON.stringify(options.body)}`);
    if (calls.length < 3) {
      throw new N8nApiError("retry", { path: options.path, status: calls.length === 1 ? 404 : 422 });
    }
    return { id: "exec-2", status: "running" };
  });

  const execution = await executeWorkflow(executor, "wf-2", { data: { dryRun: true } });

  assert.equal(execution.id, "exec-2");
  assert.deepEqual(calls, [
    'POST /workflows/wf-2/execute {"dryRun":true}',
    'POST /workflows/wf-2/run {"dryRun":true}',
    'POST /workflows/wf-2/execute {"data":{"dryRun":true}}',
  ]);
});

test("execution helpers normalize list, detail, and delete flows", async () => {
  const calls: string[] = [];
  const queries: Array<N8nApiRequestOptions["query"]> = [];
  const executor = createExecutor((options) => {
    calls.push(`${options.method} ${options.path}`);
    queries.push(options.query);

    if (options.method === "DELETE") {
      return undefined;
    }

    if (options.path === "/executions") {
      return {
        data: [
          {
            id: "exec-1",
            workflowId: "wf-1",
            status: "running",
          },
        ],
        nextCursor: "exec-next",
      };
    }

    return {
      id: "exec-1",
      workflowId: "wf-1",
      status: "success",
      finished: true,
    };
  });

  const executions = await listExecutions(executor, {
    workflowId: "wf-1",
    status: "running",
    cursor: "exec-cursor",
    limit: 25,
  });
  const execution = await getExecution(executor, "exec-1");
  await deleteExecution(executor, "exec-1");

  assert.equal(executions.data[0]!.status, "running");
  assert.equal(executions.nextCursor, "exec-next");
  assert.equal(execution.finished, true);
  assert.deepEqual(queries[0], {
    cursor: "exec-cursor",
    limit: 25,
    status: "running",
    workflowId: "wf-1",
  });
  assert.ok(calls.includes("DELETE /executions/exec-1"));
});
