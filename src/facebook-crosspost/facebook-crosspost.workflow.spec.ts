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

  it('routes only validation failures to Respond Invalid', () => {
    const validationFailed = getNode('Validation Failed?');
    const conditions = validationFailed.parameters?.conditions as { boolean?: Array<Record<string, unknown>> };

    expect(conditions?.boolean).toEqual([
      {
        value1: '={{$json.success === false}}',
        value2: true,
      },
    ]);

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

  it('returns backend-compatible response bodies', () => {
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
      respondWith: 'json',
      responseBody: '={{$json}}',
      options: {
        responseCode: 401,
      },
    });
    expect(respondResult.parameters).toMatchObject({
      respondWith: 'json',
      responseBody: '={{$json}}',
    });

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
  });
});
