#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BASE_URL = 'https://n8n.patirstudy.uz';
const DEFAULT_WORKFLOW_PATH = 'n8n/instagram-crosspost.workflow.json';
const REQUIRED_WORKFLOW_ENV_VARS = [
  'INSTAGRAM_IG_USER_ID',
  'INSTAGRAM_ACCESS_TOKEN',
  'N8N_INSTAGRAM_WEBHOOK_SECRET',
];
const WORKFLOW_LIST_LIMIT = 250;

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.N8N_BASE_URL || DEFAULT_BASE_URL);
  const workflowPath = path.resolve(process.cwd(), process.env.N8N_INSTAGRAM_WORKFLOW_PATH || DEFAULT_WORKFLOW_PATH);
  const activateWorkflow = parseBoolean(process.env.N8N_ACTIVATE_WORKFLOW);
  const dryRun = parseBoolean(process.env.N8N_DRY_RUN);
  const apiKey = process.env.N8N_API_KEY || '';

  const workflow = loadWorkflow(workflowPath);
  validateWorkflow(workflow, workflowPath);
  const sanitizedWorkflow = sanitizeWorkflowForApi(workflow);

  if (dryRun) {
    console.log(`Dry run enabled. Workflow file is valid: ${workflowPath}`);
    console.log(`Payload keys: ${Object.keys(sanitizedWorkflow).join(',')}`);
    console.log(`Would inspect ${baseUrl}/api/v1/workflows for workflow name "${workflow.name}".`);
    console.log(`Would create or update the workflow, then activate=${activateWorkflow}.`);
    return;
  }

  if (!apiKey) {
    throw new Error('N8N_API_KEY is required unless N8N_DRY_RUN=true.');
  }

  const client = createApiClient(baseUrl, apiKey);
  const existingWorkflow = await findWorkflowByName(client, workflow.name);

  if (existingWorkflow) {
    console.log(`Found existing workflow "${workflow.name}" with id=${existingWorkflow.id}. Updating.`);
    await updateWorkflow(client, existingWorkflow.id, sanitizedWorkflow);
    console.log(`Updated workflow id=${existingWorkflow.id}.`);

    if (activateWorkflow) {
      await activateExistingWorkflow(client, existingWorkflow.id);
      console.log(`Activated workflow id=${existingWorkflow.id}.`);
    }

    return;
  }

  console.log(`Workflow "${workflow.name}" does not exist yet. Creating.`);
  const createdWorkflow = await createWorkflow(client, sanitizedWorkflow);
  console.log(`Created workflow id=${createdWorkflow.id}.`);

  if (activateWorkflow) {
    await activateExistingWorkflow(client, createdWorkflow.id);
    console.log(`Activated workflow id=${createdWorkflow.id}.`);
  }
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function parseBoolean(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function loadWorkflow(workflowPath) {
  let fileContents;
  try {
    fileContents = fs.readFileSync(workflowPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read workflow file at ${workflowPath}: ${getErrorMessage(error)}`);
  }

  try {
    return JSON.parse(fileContents);
  } catch (error) {
    throw new Error(`Workflow file is not valid JSON at ${workflowPath}: ${getErrorMessage(error)}`);
  }
}

function validateWorkflow(workflow, workflowPath) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    throw new Error(`Workflow JSON in ${workflowPath} must be an object.`);
  }

  if (typeof workflow.name !== 'string' || !workflow.name.trim()) {
    throw new Error(`Workflow JSON in ${workflowPath} must include a non-empty "name".`);
  }

  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    throw new Error(`Workflow JSON in ${workflowPath} must include a non-empty "nodes" array.`);
  }

  if (!workflow.connections || typeof workflow.connections !== 'object' || Array.isArray(workflow.connections)) {
    throw new Error(`Workflow JSON in ${workflowPath} must include a "connections" object.`);
  }

  const serializedWorkflow = JSON.stringify(workflow);
  for (const requiredEnvVar of REQUIRED_WORKFLOW_ENV_VARS) {
    if (!serializedWorkflow.includes(requiredEnvVar)) {
      throw new Error(
        `Workflow JSON in ${workflowPath} must reference ${requiredEnvVar} via n8n env or credentials before deployment.`,
      );
    }
  }
}

function sanitizeWorkflowForApi(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings || {},
    pinData: workflow.pinData || {},
    staticData: workflow.staticData || null,
  };
}

function createApiClient(baseUrl, apiKey) {
  return {
    async request(method, resourcePath, body) {
      const response = await fetch(`${baseUrl}${resourcePath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (response.status === 204) {
        return null;
      }

      const responseText = await response.text();
      const responseJson = tryParseJson(responseText);

      if (!response.ok) {
        const errorMessage = extractApiError(responseJson) || responseText || `${response.status} ${response.statusText}`;
        throw new Error(
          `n8n API ${method} ${resourcePath} failed: ${truncate(errorMessage, 1000)}. ` +
            'Manual fallback: import the workflow in the UI, then publish it there if the public API on this n8n version rejects workflow updates.',
        );
      }

      return responseJson;
    },
  };
}

async function findWorkflowByName(client, workflowName) {
  const response = await client.request('GET', `/api/v1/workflows?limit=${WORKFLOW_LIST_LIMIT}`);
  const workflows = Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : [];

  return workflows.find((workflow) => workflow && workflow.name === workflowName) || null;
}

async function createWorkflow(client, workflow) {
  const response = await client.request('POST', '/api/v1/workflows', workflow);
  if (!response || typeof response.id !== 'string') {
    throw new Error('n8n API create workflow response did not include an id.');
  }
  return response;
}

async function updateWorkflow(client, workflowId, workflow) {
  const response = await client.request('PUT', `/api/v1/workflows/${workflowId}`, workflow);
  if (!response || typeof response.id !== 'string') {
    throw new Error('n8n API update workflow response did not include an id.');
  }
  return response;
}

async function activateExistingWorkflow(client, workflowId) {
  await client.request('POST', `/api/v1/workflows/${workflowId}/activate`);
}

function tryParseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function extractApiError(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') {
    return null;
  }

  if (typeof responseJson.message === 'string' && responseJson.message.trim()) {
    return responseJson.message.trim();
  }

  if (typeof responseJson.error === 'string' && responseJson.error.trim()) {
    return responseJson.error.trim();
  }

  if (responseJson.data && typeof responseJson.data === 'object' && typeof responseJson.data.message === 'string') {
    return responseJson.data.message.trim();
  }

  return null;
}

function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(`Deployment failed: ${getErrorMessage(error)}`);
  process.exitCode = 1;
});
