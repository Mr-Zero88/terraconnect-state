export const Value = Symbol("Value");
export const Get = Symbol("Get");
export const Set = Symbol("Set");
export const Modified = Symbol("Modified");
export const ChildModified = Symbol("ChildModified");
export const PreserveState = Symbol("PreserveState");

export type GetEvent = () => void;
export type SetEvent<T> = (newValue: T, oldValue: T) => boolean | void;
export type ModifiedEvent<T> = (newValue: T, oldValue: T) => boolean | void;
export type ChildModifiedEvent<T> = (newValue: T[any], key: number | string | symbol, oldValue: T[any]) => boolean | void;
export type Event<T> = { on: (callback: T) => void, off: (callback: T) => void, once: (callback: T) => void };
export type EventCallback<T extends (...args: Array<any>) => any> = (...args: Parameters<T>) => Array<ReturnType<T>>;
export type StateSymboles<T> = { [Value]: T, [Get]: Event<GetEvent>, [Set]: Event<SetEvent<T>>, [Modified]: Event<ModifiedEvent<T>>, [ChildModified]: Event<ChildModifiedEvent<T>>, [PreserveState]?: boolean }
export type complexTypes = Element | HTMLElement;
export type customArrayMethods<T extends Array<any>> = { reduce: { [Value]: typeof Array.prototype.reduce<T> }, push: { [Value]: (...items: T) => number }, pop: { [Value]: typeof Array.prototype.pop }, map: { [Value]: typeof Array.prototype.map<T> }, forEach: { [Value]: (callbackfn: (value: State<T[any]>, index: number, array: T) => void, thisArg?: any) => void } };
export type StateChildren<T> = (T extends Array<any> ? ({ [P in keyof T]: State<T[P]> } & customArrayMethods<T>) : (T extends { [key: string | number | symbol]: any } ? T extends complexTypes ? {} : { [P in keyof T]: State<T[P]> } : {}));
export type State<T> = {} & (T extends { [Value]: any } ? T : (StateSymboles<T> & StateChildren<T>));

export function createState<T>(initialValue: T): State<T>;
export function createState<T>(initialValue: State<T>): State<T>;
export function createState<T>(callback: () => T, dependens: Array<State<any>>): State<T>;
export function createState<T>(arg1: (() => T) | T | State<T>, arg2?: undefined | Array<State<any>>): State<T> {
  return (arg1 != null && typeof arg1 == "object" && (arg1 as any)[Value] != null) ? arg1 as State<T> : (typeof arg1 == "function" && arg1 instanceof Function && arg2 !== undefined ? createStateFromCallback<T>(arg1 as (() => T), arg2) : createStateFromInitValue<T>(arg1 as unknown as T));
}

function resolve(value: any, key: string | symbol): any {
  if (value[key])
    if (typeof value[key] === 'function')
      return value[key].bind(value);
    else
      return value[key];
  if (Object.getPrototypeOf(value) !== null) {
    let _ = resolve(Object.getPrototypeOf(value), key);
    if (typeof _ === 'function')
      return _.bind(value);
    return _;
  }
  return null;
}

const arrayFuctions: { [key: string]: Function } = {
  forEach: <T extends Array<unknown>>(target: State<T>) => {
    return {
      [Value]: (callback: Parameters<T['forEach']>[0]) => {
        target[Value].forEach((_, i, a) => callback(target[i], i, a));
        target[Modified].on(() => {
          target[Value].forEach((_, i, a) => callback(target[i], i, a));
        });
      }
    };
  },
  map: <T extends Array<unknown>>(target: State<T>) => {
    return {
      [Value]: (callback: Parameters<T['map']>[0]) => {
        let state = createState(target[Value].map((_, i, a) => callback(target[i], i, a)));
        target[Modified].on(() => {
          state[Value] = target[Value].map((_, i, a) => callback(target[i], i, a));
        });
        return state;
      }
    };
  },
  filter: <T extends Array<unknown>>(target: State<T>) => {
    return {
      [Value]: (callback: Parameters<T['filter']>[0]) => {
        let state = createState(target[Value].filter((_, i, a) => callback(target[i], i, a)));
        target[Modified].on(() => {
          state[Value] = target[Value].filter((_, i, a) => callback(target[i], i, a));
        });
        return state;
      }
    };
  },
  reduce: <T extends Array<unknown>>(target: State<T>) => {
    return {
      [Value]: (callback: Parameters<T['reduce']>[0]) => {
        let state = createState(target[Value].reduce((a, b, i, arr) => callback(a, target[i], i, arr), [] as Array<unknown>));
        target[ChildModified].on((_, key) => {
          if (typeof key == "string" && key.includes('.')) return;
          state[Value] = target[Value].reduce((a, b, i, arr) => callback(a, target[i], i, arr), [] as Array<unknown>);
        });
        target[Modified].on(() => {
          state[Value] = target[Value].reduce((a, b, i, arr) => callback(a, target[i], i, arr), [] as Array<unknown>);
        });
        return state;
      }
    };
  },
  push: <T extends Array<unknown>>(target: State<T>, events: { callModified: EventCallback<ModifiedEvent<T>>, callChildModified: EventCallback<ChildModifiedEvent<T>> }) => {
    let { callModified, callChildModified } = events;
    return {
      [Value]: (...items: Array<any>) => {
        let oldValue = target[Value];
        let result = target[Value].push(...items);
        items.forEach(item => target[result - 1] = createState(item));
        callModified(target[Value] as T, oldValue as T);
        callChildModified(target[Value][result - 1], result - 1, oldValue[result - 1]);
        return result;
      }
    };
  },
  pop: <T extends Array<unknown>>(target: State<T>, events: { callModified: EventCallback<ModifiedEvent<T>>, callChildModified: EventCallback<ChildModifiedEvent<T>> }) => {
    let { callModified, callChildModified } = events;
    return {
      [Value]: () => {
        let oldValue = target[Value];
        let result = target[Value].pop();
        callModified(target[Value] as T, oldValue as T);
        callChildModified(null, oldValue.length - 1, oldValue[oldValue.length - 1]);
        return result;
      }
    };
  },
};

function createStateFromInitValue<T>(value: T): State<T> {
  let target: any = { [Value]: value };
  if (typeof value == 'object' && value != null && PreserveState in value)
    target[PreserveState] = true;
  let [, callGet] = [target[Get]] = createEvent<GetEvent>("Get");
  let [, callSet] = [target[Set]] = createEvent<SetEvent<T>>("Set");
  let [, callModified] = [target[Modified]] = createEvent<ModifiedEvent<T>>("Modified");
  let [, callChildModified] = [target[ChildModified]] = createEvent<ChildModifiedEvent<T>>("ChildModified");
  if (getType(value) !== "primitive") {
    Object.entries(value as Object).forEach(([key, keyValue]) => {
      if (keyValue != null && keyValue[Value] != null) {
        target[key] = keyValue;
        //TODO: Check logic
        // if (PreserveState in target)
        //   (value as any)[key] = keyValue[Value];
      }
      else
        target[key] = createStateFromInitValue(keyValue);
      target[key][Modified].on((newValue: any, oldValue: any) => target[Value][key] = target[key][PreserveState] == null ? target[key][Value] : target[Value][key]);
      target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => target[Value][key] = oldValue === undefined ? target[Value][key] : target[key][PreserveState] == null ? target[key][Value] : target[Value][key]);
      target[key][Modified].on((newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue));
      target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => callChildModified(newValue, key + '.' + _key, oldValue));
    });
  }
  return new Proxy(target, {
    get: (target, key) => {
      if (key === Value)
        callGet();
      if (key == Value || key == Get || key == Set || key == Modified || key == ChildModified || target[key] != null)
        return target[key];
      if (Array.isArray(target[Value]) && typeof key == "string" && Object.keys(arrayFuctions).includes(key))
        return arrayFuctions[key](target, { callGet, callSet, callModified, callChildModified });
      return resolve(target[Value], key) ?? { [Value]: null };
    },
    set: (target, key, newValue) => {
      if (key !== Value) {
        console.error('You can only set the [Value] property');
        return false;
      }
      let oldValue = target[Value];
      if (oldValue === newValue)
        return true;
      if (callSet(newValue, oldValue).some(v => !v))
        return true;
      if (newValue[Value] == null)
        target[Value] = newValue;
      else
        target[Value] = newValue[Value];
      if (getType(newValue) !== "primitive") {
        Object.entries(newValue).forEach(([key, keyValue]) => {
          if (target[key] == null) {
            if ((keyValue as any)[Value] == null) {
              target[key] = createStateFromInitValue(keyValue);
              target[key][Modified].on((newValue: any, oldValue: any) => target[Value][key] = target[key][PreserveState] == null ? target[key][Value] : target[Value][key]);
              target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => target[Value][key] = oldValue === undefined ? target[Value][key] : target[key][PreserveState] == null ? target[key][Value] : target[Value][key]);
              target[key][Modified].on((newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue));
              target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => callChildModified(newValue, key + '.' + _key, oldValue));
            } else
              target[key] = (keyValue as any)[key];
            callChildModified(keyValue as any, key, undefined as any);
          } else
            target[key][Value] = keyValue;
        });
      }
      callModified(newValue, oldValue);
      return true;
    }
  }) as unknown as State<T>;
}

function createStateFromCallback<T>(callback: () => T, dependens: Array<State<any>>): State<T> {
  let state = createStateFromInitValue(callback());
  dependens.forEach(dependen => dependen[Modified].on(() => { state[Value] = callback(); return; }));
  return state;
}

function getType(value: any): "object" | "array" | "primitive" {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || value === undefined ? "primitive" : value instanceof Array ? "array" : "object";
}

function createEvent<T extends (...args: Array<any>) => any>(name: string) {
  let callbacks: Array<{ callback: T, once?: boolean }> = [];
  let callback: EventCallback<T> = ((...args: Parameters<T>) => {
    let results = callbacks.map(({ callback }) => callback(...args));
    callbacks = callbacks.filter(({ once }) => !once);
    return results;
  }) as any;
  return [
    {
      on: (callback: T) => {
        callbacks.push({ callback });
      },
      off: (callback: T) => {
        let check = callback;
        callbacks = callbacks.filter(({ callback }) => check !== callback);
      },
      once: (callback: T) => {
        callbacks.push({ callback, once: true });
      }
    },
    callback
  ] as [Event<T>, typeof callback];
}