import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CD Workflow Configuration', () => {
  it('should include the --port 8080 flag in frontend Cloud Run deployments', () => {
    const workflowPath = path.resolve(__dirname, '../.github/workflows/cd.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');

    const lines = workflowContent.split('\n');
    let inUatFrontend = false;
    let inProdFrontend = false;

    let uatHasPort = false;
    let prodHasPort = false;

    for (const line of lines) {
      if (line.includes('gcloud run deploy charlotte-frontend-uat')) {
        inUatFrontend = true;
      } else if (line.includes('gcloud run deploy charlotte-frontend') && !line.includes('-uat')) {
        inProdFrontend = true;
      }

      // Check for port in UAT block
      if (inUatFrontend) {
        if (line.includes('--port 8080')) uatHasPort = true;
        // End of command block is roughly when we hit an empty line or a new command
        if (line.trim() === '' || (line.trim().startsWith('- name:') && !line.includes('Deploy Frontend to Cloud Run'))) {
          inUatFrontend = false;
        }
      }

      // Check for port in Prod block
      if (inProdFrontend) {
        if (line.includes('--port 8080')) prodHasPort = true;
        // End of command block
        if (line.trim() === '' || (line.trim().startsWith('- name:') && !line.includes('Deploy Frontend to Cloud Run'))) {
          inProdFrontend = false;
        }
      }
    }

    expect(uatHasPort).toBe(true);
    expect(prodHasPort).toBe(true);
  });
});
