import * as fs from 'node:fs';
import * as path from 'node:path';

type WorkflowNode = {
  name: string;
  parameters?: Record<string, unknown>;
};

type WorkflowConnection = {
  node: string;
  type: string;
  index: number;
};

type Workflow = {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, { main: WorkflowConnection[][] }>;
};

describe('instagram-crosspost n8n workflow', () => {
  const workflowPath = path.resolve(__dirname, '../../n8n/instagram-crosspost.workflow.json');
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8')) as Workflow;

  function getNode(name: string): WorkflowNode {
    const node = workflow.nodes.find((entry) => entry.name === name);
    expect(node).toBeDefined();
    return node as WorkflowNode;
  }

  it('parses as valid JSON and keeps the expected workflow name', () => {
    expect(workflow.name).toBe('instagram-crosspost');
  });

  it('returns explicit success from Validate Secret on the valid path', () => {
    const validateSecret = getNode('Validate Secret');
    const jsCode = String(validateSecret.parameters?.jsCode || '');

    expect(jsCode).toContain('const body = $json.body ?? $json;');
    expect(jsCode).toContain('success: true');
    expect(jsCode).toContain('payload: body');
    expect(jsCode).toContain("return [{ json: { success: false, error: 'Invalid webhook secret' } }];");
    expect(jsCode).toContain(
      "return [{ json: { success: false, error: 'Missing instagram.caption or instagram.imageUrl in payload' } }];",
    );
  });

  it('routes success false to Respond Invalid and success true to Create Instagram Media Container', () => {
    const validationFailed = getNode('Validation Failed?');
    const parameters = validationFailed.parameters as {
      conditions?: {
        options?: Record<string, unknown>;
        conditions?: Array<Record<string, unknown>>;
        combinator?: string;
      };
      options?: Record<string, unknown>;
    };

    expect(parameters.conditions).toEqual({
      options: {
        caseSensitive: true,
        leftValue: '',
        typeValidation: 'strict',
        version: 2,
      },
      conditions: [
        {
          id: 'validation-failed-condition',
          leftValue: '={{ $json.success === false }}',
          rightValue: '',
          operator: {
            type: 'boolean',
            operation: 'true',
            singleValue: true,
          },
        },
      ],
      combinator: 'and',
    });
    expect(parameters.options).toEqual({});

    expect(workflow.connections.Webhook.main[0][0]).toEqual({
      node: 'Validate Secret',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Validate Secret'].main[0][0]).toEqual({
      node: 'Validation Failed?',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Validation Failed?'].main[0][0]).toEqual({
      node: 'Respond Invalid',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Validation Failed?'].main[1][0]).toEqual({
      node: 'Create Instagram Media Container',
      type: 'main',
      index: 0,
    });
  });

  it('returns backend-compatible response bodies from the mapped Instagram response path', () => {
    const mapContainerResponse = getNode('Map Container Response');
    const mapPublishResponse = getNode('Map Instagram Response');
    const respondInvalid = getNode('Respond Invalid');
    const respondResult = getNode('Respond Result');

    expect(String(mapContainerResponse.parameters?.jsCode || '')).toContain("return [{ json: { success: true,");
    expect(String(mapContainerResponse.parameters?.jsCode || '')).toContain('creationId: String($json.id)');
    expect(String(mapPublishResponse.parameters?.jsCode || '')).toContain(
      "return [{ json: { success: true, instagramPostId: String($json.id) } }];",
    );
    expect(String(mapPublishResponse.parameters?.jsCode || '')).toContain(
      "return [{ json: { success: false, error: String(errorMessage) } }];",
    );
    expect(respondInvalid.parameters).toMatchObject({
      respondWith: 'firstIncomingItem',
      options: {
        responseCode: 401,
      },
    });
    expect(respondResult.parameters).toMatchObject({
      respondWith: 'firstIncomingItem',
    });

    expect(workflow.connections['Create Instagram Media Container'].main[0][0]).toEqual({
      node: 'Map Container Response',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Map Container Response'].main[0][0]).toEqual({
      node: 'Container Failed?',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Container Failed?'].main[1][0]).toEqual({
      node: 'Publish Instagram Media',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Publish Instagram Media'].main[0][0]).toEqual({
      node: 'Map Instagram Response',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Map Instagram Response'].main[0][0]).toEqual({
      node: 'Respond Result',
      type: 'main',
      index: 0,
    });
  });
});
