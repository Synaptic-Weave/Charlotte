const fs = require('fs');
const path = './tests/rls.test.ts';
let code = fs.readFileSync(path, 'utf8');

const seedA = `        sessionA = CallSession.create(tenantA, 'CA_RLS_TEST_ACME_001');

        txEm.persist([tenantA, userA, orgA, phoneA, sessionA]);`;

const seedA_new = `        sessionA = CallSession.create(tenantA, 'CA_RLS_TEST_ACME_001');
        const customerA = Customer.create(tenantA, 'Alice', '+15550001111', 'Acme VIP');

        txEm.persist([tenantA, userA, orgA, phoneA, sessionA, customerA]);`;

const seedB = `        sessionB = CallSession.create(tenantB, 'CA_RLS_TEST_STARK_001');

        txEm.persist([tenantB, userB, orgB, phoneB, sessionB]);`;

const seedB_new = `        sessionB = CallSession.create(tenantB, 'CA_RLS_TEST_STARK_001');
        const customerB = Customer.create(tenantB, 'Bob', '+15550002222', 'Stark VIP');

        txEm.persist([tenantB, userB, orgB, phoneB, sessionB, customerB]);`;

code = code.replace(seedA, seedA_new);
code = code.replace(seedB, seedB_new);

fs.writeFileSync(path, code);
console.log('Patched seeds');
