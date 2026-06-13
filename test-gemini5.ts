import { LiveClient } from '@google/genai';
declare const client: LiveClient;
client.send({
  toolResponse: {
    functionResponses: [{
      name: 'transfer_call',
      id: 'abc',
      response: { result: 'ok' }
    }]
  }
});
