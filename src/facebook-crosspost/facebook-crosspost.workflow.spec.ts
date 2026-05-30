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

describe('facebook-crosspost n8n workflow', () => {
  const workflowPath = path.resolve(__dirname, '../../n8n/facebook-crosspost.workflow.json');
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8')) as Workflow;

  function getNode(name: string): WorkflowNode {
    const node = workflow.nodes.find((entry) => entry.name === name);
    expect(node).toBeDefined();
    return node as WorkflowNode;
  }

  it('parses as valid JSON and keeps the expected workflow name', () => {
    expect(workflow.name).toBe('facebook-crosspost');
  });

  it('returns explicit success from Validate Secret on the valid path', () => {
    const validateSecret = getNode('Validate Secret');
    const jsCode = String(validateSecret.parameters?.jsCode || '');

    expect(jsCode).toContain('const body = $json.body ?? $json;');
    expect(jsCode).toContain('success: true');
    expect(jsCode).toContain('payload: body');
    expect(jsCode).toContain('graphUrl: `https://graph.facebook.com/${$env.FACEBOOK_API_VERSION}/${$env.FACEBOOK_PAGE_ID}/feed`');
    expect(jsCode).toContain("return [{ json: { success: false, error: 'Invalid webhook secret' } }];");
    expect(jsCode).toContain("return [{ json: { success: false, error: 'Missing facebook.message or facebook.link in payload' } }];");
  });

  it('routes success false to Respond Invalid and success true to Post to Facebook Page', () => {
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
      node: 'Post to Facebook Page',
      type: 'main',
      index: 0,
    });
  });

  it('returns backend-compatible response bodies from the mapped Facebook response path', () => {
    const mapResponse = getNode('Map Facebook Response');
    const respondInvalid = getNode('Respond Invalid');
    const respondResult = getNode('Respond Result');

    expect(String(mapResponse.parameters?.jsCode || '')).toContain(
      "return [{ json: { success: true, facebookPostId: String($json.id) } }];",
    );
    expect(String(mapResponse.parameters?.jsCode || '')).toContain(
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
    expect(respondInvalid.parameters).not.toHaveProperty('responseBody');
    expect(respondResult.parameters).not.toHaveProperty('responseBody');

    expect(workflow.connections['Post to Facebook Page'].main[0][0]).toEqual({
      node: 'Map Facebook Response',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Map Facebook Response'].main[0][0]).toEqual({
      node: 'Respond Result',
      type: 'main',
      index: 0,
    });
    expect(workflow.connections['Validate Secret'].main[0][0]).not.toEqual({
      node: 'Respond Result',
      type: 'main',
      index: 0,
    });
  });
});
