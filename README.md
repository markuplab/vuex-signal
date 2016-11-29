## Vuex Signal 

[![Build Status](https://travis-ci.org/markuplab/vuex-signal.svg?branch=master)](https://travis-ci.org/markuplab/vuex-signal)

Simple function tree runner for Vuex, based on ideas from Cerebral signals.

### Installation

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
