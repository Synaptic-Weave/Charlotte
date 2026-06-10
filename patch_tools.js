const fs = require('fs');
const path = './src/routes/streams.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Add tools declaration
const targetToolsDecl = `                              required: ['department'],
                            },
                          },
                        ],`;
const newToolsDecl = `                              required: ['department'],
                            },
                          },
                          {
                            name: 'query_crm',
                            description: 'Query the CRM for customer context using their phone number.',
                            parameters: {
                              type: 'OBJECT',
                              properties: {
                                phoneNumber: {
                                  type: 'STRING',
                                  description: 'The phone number of the customer to look up. It should include the country code (e.g. +1).',
                                },
                              },
                              required: ['phoneNumber'],
                            },
                          },
                        ],`;

code = code.replace(targetToolsDecl, newToolsDecl);

// 2. Add function execution block
const targetToolExec = `                            }
                          }
                        }
                      } catch (err) {
                        console.error('[Gemini] Error handling message:', err);`;

const newToolExec = `                            } else if (fn.name === 'query_crm') {
                              const { phoneNumber } = fn.args;
                              console.log(\`[Tool Call] Model triggered query_crm for: \${phoneNumber}\`);
                              
                              let crmResponse = 'No customer found with that phone number.';
                              try {
                                await tenantLocalStorage.run({ tenantId: tenantId! }, async () => {
                                  const { CustomerService } = await import('../services/CustomerService.js');
                                  const customerSvc = new CustomerService(em);
                                  const customer = await customerSvc.findByPhoneNumber(phoneNumber);
                                  if (customer) {
                                    crmResponse = \`Customer found: Name: \${customer.name}. Context: \${customer.context || 'None'}\`;
                                  }
                                });
                              } catch (err) {
                                console.error('[Tool Call] Error executing query_crm:', err);
                                crmResponse = 'Error occurred while querying the CRM.';
                              }

                              await geminiSession.sendToolResponse({
                                functionResponses: [
                                  {
                                    name: 'query_crm',
                                    id: fn.id,
                                    response: {
                                      status: 'success',
                                      message: crmResponse,
                                    },
                                  },
                                ],
                              });
                            }
                          }
                        }
                      } catch (err) {
                        console.error('[Gemini] Error handling message:', err);`;

code = code.replace(targetToolExec, newToolExec);

fs.writeFileSync(path, code);
console.log('Patched streams.ts');
