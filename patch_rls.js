const fs = require('fs');
const path = './tests/rls.test.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Add CustomerSchema import
code = code.replace(
  "import { CallSessionSchema } from '../src/domain/schemas/CallSession.schema.js';",
  "import { CallSessionSchema } from '../src/domain/schemas/CallSession.schema.js';\nimport { CustomerSchema } from '../src/domain/schemas/Customer.schema.js';\nimport { Customer } from '../src/domain/entities/Customer.js';\nimport { CustomerService } from '../src/services/CustomerService.js';"
);

// 2. Add to entities array
code = code.replace(
  "entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],",
  "entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],"
);
code = code.replace(
  "entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],",
  "entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],"
);

code = code.replace(
  "entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],",
  "entities: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],"
);
code = code.replace(
  "entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema],",
  "entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, TwilioPhoneNumberSchema, CallSessionSchema, CustomerSchema],"
);

fs.writeFileSync(path, code);
console.log('Patched rls.test.ts imports and entities arrays');
