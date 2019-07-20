import Dep from './dep';
import { arrayMethods, hasPath } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isNum,
  isPlainObject,
  isValidArrayIndex
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

const getRootAndPathMap = (key, parent) => {
  if (parent) {
    const parentPathMap = parent.__ob__.pathMap;
    const setPath = isNum(key) ? path => `${path}[${key}]` : path => `${path}.${key}`
    let pathMap = {};
    const keys = Object.keys(parentPathMap)
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (parentPathMap[k].path) {
        const path = setPath(parentPathMap[k].path);
        let root = '';
        let i = 0;
        while (i < path.length && (path[i] !== '.' && path[i] !== '[')) {
          root += path[i++];
        }
        pathMap[path] = {key, root, path};
      } else {
        pathMap[key] = {key, root: key, path: key}
      }
    }
    return pathMap;
  }
  return {[key]: {key, root: key, path: key}};
};

const propPathEq = (path, value, obj) => {
  let objValue = obj;
  let key = '';
  let i = 0;
  while (i < path.length) {
    if (path[i] !== '.' && path[i] !== '[' && path[i] !== ']') {
      key += path[i];
    } else if (key.length !== 0) {
      objValue = objValue[key];
      key = '';
      if (!isObject(objValue)) {
        return false;
      }
    }
    i++;
  }
  if (key.length !== 0) {
    objValue = objValue[key];
  }
  return value === objValue;
};

/**
 * By default, when a reactive property is set, the new value is
 * also converted to become reactive. However when passing down props,
 * we don't want to force conversion because the value may be a nested value
 * under a frozen data structure. Converting it would defeat the optimization.
 */
export const observerState = {
  shouldConvert: true
}

/**
 * Observer class that are attached to each observed
 * object. Once attached, the observer converts target
 * object's property keys into getter/setters that
 * collect dependencies and dispatches updates.
 */
export class Observer {

  constructor ({vm, key, value, parent}) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0;
    this.vm = vm;
    this.pathMap = getRootAndPathMap(key, parent)

    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      this.observeArray(key, value);
    } else {
      this.walk(key, value);
    }
  }

  /**
   * Walk through each property and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (key, obj) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive({ vm: this.vm, obj: obj, key: keys[i], value: obj[keys[i]], parent: obj });
      //defineReactive(this.vm, obj, keys[i], obj[keys[i]]);
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (key, items) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe({ vm: this.vm, key: i, value: items[i], parent: items });
    }
  }
}

// helpers

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src, keys) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target, src, keys) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

// 更新 __ob__ 的 path
function traverseUpdatePath (key, value, parent, vm) {
  if (!isObject(value)) {
    return
  }
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    const ob = value.__ob__
    const pathMap = getRootAndPathMap(key, parent);

    // 已经是 observer，但是位置发生了变化，需要重新更新路径
    const keys = Object.keys(pathMap);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const {root, path} = pathMap[key];
      if (!(path in ob.pathMap)) {
        ob.pathMap[path] = {key, root, path};
        let keys;
        if (Array.isArray(value)) {
          keys = Array.from(Array(value.length), (val, index) => index);
        } else {
          keys = Object.keys(value);
        }

        // 深度遍历更新路径
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          traverseUpdatePath(key, value[key], value, vm);
        }

        // 清除不存在的路径
        keys = Object.keys(ob.pathMap);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (!propPathEq(ob.pathMap[key].path, value, vm)) {
            delete ob.pathMap[key];
          }
        }
      }
    }
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe ({vm, key, value, parent, root}) {
  if (!isObject(value)) {
    return
  }
  let ob;
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
    traverseUpdatePath(key, value, parent, vm)
  } else if (
    observerState.shouldConvert &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer({vm: vm, key: key, value: value, parent: parent});
  }
  if (root && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive ({vm, obj, key, value, parent, customSetter, shallow}) {
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  if (!getter && arguments.length === 2) {
    value = obj[key]
  }
  const setter = property && property.set

  let childOb = !shallow && observe({vm: vm, key: key, value: value, parent: obj});
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const val = getter ? getter.call(obj) : value
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(val)) {
            dependArray(val)
          }
        }
      }
      return val
    },
    set: function reactiveSetter (newVal) {
      const val = getter ? getter.call(obj) : value
      /* eslint-disable no-self-compare */
      if (newVal === val || (newVal !== newVal && val !== value)) {
        return
      }
      if (vm) {
        parent = parent || key;

        // push parent key to dirty, wait to setData
        if (vm.$dirty) {
          const pathMap = getRootAndPathMap(key, obj);
          const keys = Object.keys(pathMap);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const {root, path} = pathMap[key];
            if (hasPath(path, vm)) {
              vm.$dirty.push(root, path, newVal);
            } else {
              delete pathMap[key]
            }
          }
        }
      }

      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      if (setter) {
        setter.call(obj, newVal)
      } else {
        value = newVal
      }
      childOb = !shallow && observe({ vm: vm, key: key, value: newVal, parent: parent });
      dep.notify();
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (vm, target, key, val) {
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val;
  }
  if (vm) {
    // push parent key to dirty, wait to setData
    if (vm.$dirty) {
      const pathMap = getRootAndPathMap(key, target);
      const keys = Object.keys(pathMap)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const {root, path} = pathMap[key];
        if (hasPath(path, vm)) {
          vm.$dirty.push(root, path, val);
        } else {
          delete pathMap[key];
        }
      }

    }
  }

  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive({ vm: vm,  obj: ob.value, key: key, value: val });
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target, key) {
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  // set $dirty
  target[key] = null;
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
