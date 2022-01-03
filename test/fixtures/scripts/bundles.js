const js = `import require$$0 from 'path';
import require$$1 from 'axios';

var main$1 = {};

var dep$1 = function () {
  console.log('dep...');
};

const path = require$$0;
const axios = require$$1;

const dep = dep$1;

function main () {
  console.log(path.join(__dirname, './'));
  console.log(axios);
  console.log(dep());
}

main();

export { main$1 as default };
`

const ts = 'var message = \'Hello, World!\';\nconsole.log(message);\n'

module.exports = {
  js, ts
}
