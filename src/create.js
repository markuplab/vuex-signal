module.exports = {
  /**
   * Signal factory. Create signal functions with deep analyzed structure.
   * Every signal run, have full meta information about every action called within signal.
   * Before create, signal will be analyzed for correct definition.
   *
   * @example:
   *  let actions = [
   *    syncAction,
   *    [
   *      asyncAction,
   *      {
   *        success: [successSyncAction],
   *        error: [errorSyncAction]
   *      }
   *    ]
   *  ];
   *
   *  const signal = signal.create(actions);
   *
   *  // You can run signal as function that return Promise with results
   *  signal(store);
   *
   * That have 3 args: args, store, output.
   * All args passed automatically when you run signal.
   *
   * @param {Array} actions
   * @return {Function}
   */
  create (actions) {
    return (store, args = {}) => {
      return new Promise((resolve, reject) => {
          let promise = { resolve, reject };
      const start = Date.now();

      // Transform signal definition to flatten array
      const tree = staticTree(actions);

      // Create signal definition
      const signal = {
        args,
        branches: tree.branches,
        isExecuting: true,
        duration: 0
      };

      // Start recursive run tree branches
      runBranch(0, { tree, args, signal, promise, start, store });
    });
    };
  }
};

/**
 * Run tree branch, or resolve signal
 * if no more branches in recursion.
 * @param {Number} index
 * @param {Object} options
 * @param {Object} options.tree
 * @param {Object} options.args
 * @param {Object} options.signal
 * @param {Object} options.promise
 * @param {Date}   options.start
 * @param {Vuex}   options.store
 */
function runBranch (index, options) {
  let { tree, signal, start, promise } = options;
  let currentBranch = tree.branches[index];

  if (!currentBranch && tree.branches === signal.branches) {
    if (tree.branches[index - 1]) {
      tree.branches[index - 1].duration = Date.now() - start;
    }

    signal.isExecuting = false;

    if (promise) {
      promise.resolve(signal);
    }

    return;
  }

  if (!currentBranch) {
    return;
  }

  if (Array.isArray(currentBranch)) {
    return runAsyncBranch(index, currentBranch, options);
  } else {
    return runSyncBranch(index, currentBranch, options);
  }
}

/**
 * Run async branch
 * @param {Number} index
 * @param {Object} currentBranch
 * @param {Object} options
 * @param {Object} options.tree
 * @param {Object} options.args
 * @param {Object} options.signal
 * @param {Object} options.promise
 * @param {Date}   options.start
 * @param {Vuex}   options.store
 * @returns {Promise}
 */
function runAsyncBranch (index, currentBranch, options) {
  let { tree, args, signal, store, promise, start } = options;

  let promises = currentBranch
      .map(action => {
      let actionFunc = tree.actions[action.actionIndex];
  let actionArgs = [args, store];
  let outputs = action.outputs ? Object.keys(action.outputs) : [];

  action.isExecuting = true;
  action.args = merge({}, args);

  let nextActionPromise;

  let next = createNextAsyncAction(actionFunc, outputs);
  actionFunc.apply(null, actionArgs.concat(next.fn));
  nextActionPromise = next.promise;

  return nextActionPromise
    .then(result => {
    action.hasExecuted = true;
  action.isExecuting = false;
  action.output = result.args;

  merge(args, result.args);

  if (result.path) {
    action.outputPath = result.path;
    let output = action.outputs[result.path];

    return runBranch(0, {
      args, signal, store, start, promise,
      tree: { actions: tree.actions,  branches: output }
    });
  }
})
.catch((e) => promise.reject(e));
});

  return Promise.all(promises)
      .then(() => runBranch(index + 1, options));
}

/**
 * Run sync branch
 * @param {Number} index
 * @param {Object} currentBranch
 * @param {Object} options
 * @param {Object} options.tree
 * @param {Object} options.args
 * @param {Object} options.signal
 * @param {Object} options.promise
 * @param {Date}   options.start
 * @param {Vuex}   options.store
 * @returns {Promise|undefined}
 */
function runSyncBranch (index, currentBranch, options) {
  let { args, tree, signal, store, start, promise } = options;

  try {
    let action = currentBranch;
    let actionFunc = tree.actions[action.actionIndex];
    let actionArgs = [args, store];
    let outputs = action.outputs ? Object.keys(action.outputs) : [];

    action.args = merge({}, args);

    let next = createNextSyncAction(actionFunc, outputs);
    actionFunc.apply(null, actionArgs.concat(next));

    let result = next._result || {};
    merge(args, result.args);

    action.isExecuting = false;
    action.hasExecuted = true;
    action.output = result.args;

    if (result.path) {
      action.outputPath = result.path;
      let output = action.outputs[result.path];

      let runResult = runBranch(0, {
        args, signal, store, start, promise,
        tree: {
          actions: tree.actions,
          branches: output
        }
      });

      if (runResult && runResult.then) {
        return runResult.then(() => {
            return runBranch(index + 1, options);
      });
      }

      return runBranch(index + 1, options);
    }
    return runBranch(index + 1, options);
  } catch (e) {
    promise.reject(e);
  }
}

/**
 * Add output paths to next function.
 *
 * Outputs takes from branches tree object.
 * @example:
 *  let actions = [
 *    syncAction,
 *    [
 *      asyncAction,
 *      {
 *        custom1: [custom1SyncAction],
 *        custom2: [custom2SyncAction]
 *      }
 *    ]
 *  ];
 *
 *  function asyncAction ({}, state, output) {
 *    if ( ... ) {
 *      output.custom1();
 *    } else {
 *      output.custom2();
 *    }
 *  }
 *
 * @param {Function} next
 * @param {Array} outputs
 * @returns {*}
 */
function addOutputs (next, outputs) {
  if (Array.isArray(outputs)) {
    outputs.forEach(key => {
      next[key] = next.bind(null, key);
  });
  }

  return next;
}

/**
 * Create next function in signal chain.
 * It's unified method for async and sync actions.
 * @param {Function} action
 * @param {Function} [resolver]
 * @returns {Function}
 */
function createNextFunction (action, resolver) {
  return function next (...args) {
    let path = typeof args[0] === 'string' ? args[0] : null;
    let arg = path ? args[1] : args[0];

    let result = {
      path: path ? path : action.defaultOutput,
      args: arg
    };

    if (resolver) {
      resolver(result);
    } else {
      next._result = result;
    }
  };
}

/**
 * Create next sync action
 * @param {Function} actionFunc
 * @param {Array} outputs
 * @returns {Function}
 */
function createNextSyncAction (actionFunc, outputs) {
  let next = createNextFunction(actionFunc);
  next = addOutputs(next, outputs);

  return next;
}

/**
 * Create next sync action
 * @param {Function} actionFunc
 * @param {Array} outputs
 * @returns {{}}
 */
function createNextAsyncAction (actionFunc, outputs) {
  let resolver = null;
  let promise = new Promise((resolve) => resolver = resolve);
  let fn = createNextFunction(actionFunc, resolver);
  addOutputs(fn, outputs);

  return { fn, promise };
}

/**
 * Transform signal actions to static tree.
 * Every function will be exposed as object definition,
 * that will store meta information and function call results.
 * @param {Array} signalActions
 * @returns {{ actions: [], branches: [] }}
 */
function staticTree (signalActions) {
  let actions = [];
  let branches = transformBranch(signalActions, [], [], actions, false);
  return { actions, branches };
}

/**
 * Transform tree branch
 * @param {Function|Array} action
 * @param {Array}          args
 * @param {Function}       args.action
 * @param {Array|Function} args.parentAction
 * @param {Array}          args.path
 * @param {Array}          args.actions
 * @param {Boolean}        args.isSync
 * @return {Object}
 */
function transformBranch (action, ...args) {
  return Array.isArray(action) ?
    transformAsyncBranch.apply(null, [action, ...args]) :
  transformSyncBranch.apply(null, [action, ...args]);
}

/**
 * Transform action to async branch
 * @param {Function} action
 * @param {Array|Function} parentAction
 * @param {Array} path
 * @param {Array} actions
 * @param {Boolean} isSync
 * @returns {*}
 */
function transformAsyncBranch (action, parentAction, path, actions, isSync) {
  action = action.slice();
  isSync = !isSync;
  return action
      .map((subAction, index) => {
      path.push(index);
  let result = transformBranch(subAction, action, path, actions, isSync);
  path.pop();
  return result;
})
.filter(branch => !!branch);
}

/**
 * Transform action to sync branch
 * @param {Function} action
 * @param {Array|Function} parentAction
 * @param {Array} path
 * @param {Array} actions
 * @param {Boolean} isSync
 * @returns {{
 *    name: *, args: {}, output: null, duration: number,
 *    isAsync: boolean, outputPath: null,
 *    isExecuting: boolean, hasExecuted: boolean,
 *    path: *, outputs: null, actionIndex: number
 *  }|undefined}
 */
function transformSyncBranch (action, parentAction, path, actions, isSync) {
  let branch = {
    name: getFunctionName(action),
    args: {},
    output: null,
    duration: 0,
    isAsync: !isSync,
    outputPath: null,
    isExecuting: false,
    hasExecuted: false,
    path: path.slice(),
    outputs: null,
    actionIndex: actions.indexOf(action) === -1 ? actions.push(action) - 1 : actions.indexOf(action)
  };

  let nextAction = parentAction[parentAction.indexOf(action) + 1];
  if (!Array.isArray(nextAction) && typeof nextAction === 'object') {
    parentAction.splice(parentAction.indexOf(nextAction), 1);

    branch.outputs = Object.keys(nextAction)
        .reduce((paths, key) => {
        path = path.concat('outputs', key);
    paths[key] = transformBranch(nextAction[key], parentAction, path, actions, false);
    path.pop();
    path.pop();
    return paths;
  }, {});
  }

  return branch;
}

/**
 * Get function name
 * @param {Function} fn
 * @returns {String}
 */
function getFunctionName (fn) {
  let name = fn.toString();
  name = name.substr('function '.length);
  name = name.substr(0, name.indexOf('('));
  return name;
}

/**
 * Merge two objects
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
function merge (target, source) {
  source = source || {};
  return Object.keys(source).reduce((targetKey, key) => {
      targetKey[key] = source[key];
  return target;
}, target);
}
