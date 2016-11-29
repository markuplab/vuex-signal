const Lab = require('lab');
const lab = exports.lab = Lab.script();
const assert = require('assert');
const signal = require('../src/create');
const sinon = require('sinon');

/**
 * Test helpers
 */
function noop () {}

/**
 * Cases
 */
lab.experiment('#create', function () {
  let store;

  lab.beforeEach(function(done) {
    store = {
      commit: sinon.spy()
    };

    done();
  });

  lab.test('should run signal with one sync action', function (done) {
    const run = signal.create([noop]);
    run(store);
    done();
  });

  lab.test('should run signal with one sync action and commit mutation', function (done) {
    function sync (args, store) {
      store.commit(args.name);
    }

    const run = signal.create([sync]);
    run(store, { name: 'TEST_MUTATION' });
    assert(store.commit.calledWith('TEST_MUTATION'));
    done();
  });

  lab.test('should run signal with two sync action and commit mutations', function (done) {
    function first (args, store) {
      store.commit('HELLO');
      assert(store.commit.calledWith('HELLO'));
    }

    function second (args, store) {
      store.commit('WORLD');
      assert(store.commit.calledWith('WORLD'));
    }

    const run = signal.create([first, second]);

    run(store);
    done();
  });

  lab.test('should run signal with one async action and output to success', function (done) {
    let counter = 0;

    function async (args, store, output) {
      counter += 1;
      assert(counter, 1);
      output.success();
    }

    function success () {
      counter += 1;
      assert(counter, 2);
      done();
    }

    const run = signal.create([
      [
        async, {
          success: [
            success
          ]
        }
      ]
    ]);

    run(store);
  });

  lab.test('should pass async acton output args to next actions', function (done) {
    function async (args, store, output) {
      output.success({ test: 'test' });
    }

    function success (args) {
      assert(args.test);
      done();
    }

    const run = signal.create([
      [
        async, {
          success: [
            success
          ]
        }
      ]
    ]);

    run(store);
  });

  lab.test('should can output to different ways from sync action', function (done) {
    function sync (args, state, output) {
      output.success();
    }

    function success () {
      done();
    }

    const run = signal.create([sync, {
      success: [ success ]
    }]);

    run(store);
  });

  lab.test('should pass arguments to outputs if action is sync', function (done) {
    function sync (args, state, output) {
      output.success({ test: 'test' });
    }

    function success (args) {
      assert(args.test);
      done();
    }

    const run = signal.create([sync, {
      success: [ success ]
    }]);

    run(store);
  });

  lab.test('should correct run chain of sync and async actions', function (done) {
    let times = 0;

    function syncWithoutOutputFirst () {
      times += 1;
      assert.equal(times, 1);
    }

    function syncWithoutOutputSecond () {
      times += 1;
      assert.equal(times, 4);
    }

    function syncWithOutput (args, state, output) {
      times += 1;
      assert.equal(times, 2);
      output.success();
    }

    function async (args, state, output) {
      times += 1;
      assert.equal(times, 5);
      output.success();
    }

    function successSync () {
      times += 1;
      assert.equal(times, 3);
    }

    function successAsync () {
      times += 1;
      assert.equal(times, 6);
    }

    function syncFinal () {
      times += 1;
      assert.equal(times, 7);
      done();
    }

    const run = signal.create([
      syncWithoutOutputFirst,
      syncWithOutput, {
        success: [
          successSync
        ]
      },
      syncWithoutOutputSecond,
      [
        async, {
        success: [
          successAsync
        ]
      }
      ],
      syncFinal
    ]);

    run(store);
  });

  lab.test('must pass and extend args thru all actions', function (done) {
    function async (args, state, output) {
      assert(args.sync);
      output.success({ async: 'async' });
    }

    function sync (args, state, output) {
      assert(args.test);
      output({ sync: 'sync' });
    }

    function success (args) {
      assert(args.async);
      assert(args.test);
      assert(args.sync);
      done();
    }

    const run = signal.create([
      sync,
      [
        async, {
          success: [success]
        }
      ]
    ]);

    run(store, { test: 'test' });
  });

  lab.test('Deep async actions must run correctly', function (done) {
    function async (args, state, output) {
      output.success();
    }

    function sync (args, state, output) {
      output.success();
    }

    function success () {
      done();
    }

    function successSync (args) {
      assert(args);
    }

    const run = signal.create([
      [
        async, {
        success: [
          sync, {
            success: [
              successSync
            ]
          },
          [async, {
            success: [
              success
            ]
          }]
        ]
      }
      ]
    ]);

    run(store);
  });

  lab.test('Should run output actions when ready parent action in async concurrence run', function (done) {
    let times = 0;

    function slow (args, state, output) {
      setTimeout(function () {
        output.success();
      }, 10);
    }

    function fast (args, state, output) {
      setTimeout(function () {
        output.success();
      }, 0);
    }

    function slowSuccess () {
      times += 1;
      assert.equal(times, 2);
      done();
    }

    function fastSuccess () {
      times += 1;
      assert.equal(times, 1);
    }

    const run = signal.create([
      [
        slow, {
        success: [
          slowSuccess
        ]
      },
        fast, {
        success: [
          fastSuccess
        ]
      }
      ]
    ]);

    run(store);
  });

  lab.test('should can output from sync to async action', function (done) {
    function sync (args, state, output) {
      output.success();
    }

    function async (args, state, output) {
      output.success();
    }

    function success () {
      done();
    }

    const run = signal.create([
      sync, {
        success: [
          [ async, { success: [ success ]} ]
        ]
      }
    ]);

    run(store);
  });

  lab.test('should reject signal promise if error in sync action', function (done) {
    function syncWithError (args, store) {
      store.commit('TEST', args.undefinedArg.deepArg);
    }

    const run = signal.create([
      syncWithError
    ]);

    run(store)
      .catch((e) => {
        assert(e instanceof Error);
        done();
      });
  });

  lab.test('should reject signal promise if error in async action', function (done) {
    function asyncWithError (args, store, output) {
      store.commit('test', args.undefinedArg.deepArg);
      output.success();
    }

    const run = signal.create([
      [
        asyncWithError, {
        success: [
          noop
        ]
      }
      ]
    ]);

    run(store)
      .catch((e) => {
        assert(e instanceof Error);
        done();
      });
  });

  lab.test('should reject signal promise if error in async output action', function (done) {
    function syncWithError (args, store) {
      store.commit('TEST', args.undefinedArg.deepArg);
    }

    function async (args, state, output) {
      output.success();
    }

    const run = signal.create([
      [
        async,
        {
          success: [
            syncWithError
          ]
        }
      ]
    ]);

    run(store)
      .catch((e) => {
        assert(e instanceof Error);
        done();
      });
  });

  lab.test('should throw error, if no executed output in async actions', function (done) {
    function async (args, state, output) {
      output.success();
    }

    const run = signal.create([
      [
        async, {
          custom: []
        }
      ]
    ]);

    run(store)
      .catch((e) => {
        assert(e instanceof Error);
        done();
      });
  });

  lab.test('should correct run tree with sync action that output to async', (done) => {
    let counter = 0;

    function async (args, state, output) {
      setTimeout(() => {
        counter += 1;
        assert.equal(counter, 1);
        output.success();
      }, 0);
    }

    function sync (args, state, output) {
      output.success();
    }

    const run = signal.create([
      sync, {
        success: [
          [
            async, {
            success: [noop]
          }
          ]
        ]
      }
    ]);

    run(store).then(function () {
      counter += 1;
      assert.equal(counter, 2);
      done();
    }).catch(done);
  });
});
