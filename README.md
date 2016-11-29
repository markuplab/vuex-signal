## Vuex Signal

Simple function tree runner for Vuex, based on ideas from Cerebral signals.

### Instalation

```
npm install vuex-signal --save
```

### Getting started

```javascript
const signal = require('vuex-signal');
const store = require('./vuexStore');

function action (args, store) {
  store.commit('TEST_MUTATION', args.name);
}

const runner = signal.create([action]);
runner(store, { name: 'evan' });
```
