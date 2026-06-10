const fs = require('fs');
const path = './.cspell.json';
let config = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!config.words.includes('crm')) {
  config.words.push('crm');
}
fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('Patched cspell');
