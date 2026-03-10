const fs = require('node:fs');
const path = require('node:path');

function createWindowStateStore(app, namespace) {
  const stateFile = path.join(app.getPath('userData'), `${namespace}.window-state.json`);

  function read() {
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch {
      return {};
    }
  }

  function write(nextState) {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(nextState, null, 2), 'utf-8');
  }

  return {
    load() {
      return read();
    },
    save(name, bounds) {
      const current = read();
      current[name] = bounds;
      write(current);
    },
  };
}

module.exports = {
  createWindowStateStore,
};
