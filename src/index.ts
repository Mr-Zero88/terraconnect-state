export const Value = Symbol("Value");
export const Get = Symbol("Get");
export const Set = Symbol("Set");
export const Modified = Symbol("Modified");
export const ChildModified = Symbol("ChildModified");

export type GetEvent = () => void;
export type SetEvent<T> = (newValue: T, oldValue: T) => boolean | void;
export type ModifiedEvent<T> = (newValue: T, oldValue: T) => boolean | void;
export type ChildModifiedEvent<T> = (newValue: T, key: number | string | symbol, oldValue: T) => boolean | void;
export type Event<T> = { on: (callback: T) => void, off: (callback: T) => void, once: (callback: T) => void };
export type StateSymboles<T> = { [Value]: T, [Get]: Event<GetEvent>, [Set]: Event<SetEvent<T>>, [Modified]: Event<ModifiedEvent<T>>, [ChildModified]: Event<ChildModifiedEvent<T>> }
export type complexTypes = Element | HTMLElement;
export type customArrayMethods<T extends Array<any>> = { reduce: { [Value]: typeof Array.prototype.reduce<T> }, push: { [Value]: (...items: T) => number }, pop: { [Value]: typeof Array.prototype.pop }, map: { [Value]: typeof Array.prototype.map<T> }};
export type StateChildren<T> = (T extends Array<any> ? ({ [P in keyof T]: State<T[P]> } & customArrayMethods<T>) : (T extends { [key: string | number | symbol]: any } ? T extends complexTypes ? {} : { [P in keyof T]: State<T[P]> } : {}));
export type State<T> = {} & (T extends { [Value]: any } ? T : (StateSymboles<T> & StateChildren<T>));
// & (T extends Array<any> ? { [P in keyof T]: State<T[P]> } & { reduce: { [Value]: typeof Array.prototype.reduce<T> }, push: { [Value]: (...items: T) => number }, pop: { [Value]: typeof Array.prototype.pop }, map: { [Value]: typeof Array.prototype.map<T> } } : (T extends { [key: string | number | symbol]: any } ? { [P in keyof T]: State<T[P]> } : ({})))

export function createState<T>(initialValue: T): State<T>;
export function createState<T>(initialValue: State<T>): State<T>;
export function createState<T>(callback: () => T, dependens: Array<State<any>>): State<T>;
export function createState<T>(arg1: (() => T) | T | State<T>, arg2?: undefined | Array<State<any>>): State<T> {
  return (arg1 != null && typeof arg1 == "object" && (arg1 as any)[Value] != null) ? arg1 as State<T> : (typeof arg1 == "function" && arg1 instanceof Function && arg2 !== undefined ? createStateFromCallback<T>(arg1 as (() => T), arg2) : createStateFromInitValue<T>(arg1 as unknown as T));
}

// function createStateFromInitValueWithParent<T>(value: T, parent?: any): State<T> {
function createStateFromInitValue<T>(value: T): State<T> {
  let target: any = { [Value]: value };
  let [, callGet] = [target[Get]] = createEvent<GetEvent>("Get");
  let [, callSet] = [target[Set]] = createEvent<SetEvent<T>>("Set");
  let [, callModified] = [target[Modified]] = createEvent<ModifiedEvent<T>>("Modified");
  let [, callChildModified] = [target[ChildModified]] = createEvent<ChildModifiedEvent<T>>("ChildModified");
  // let callModified = (...[newValue, oldValue]: Parameters<typeof _callModified>) => _callModified(newValue, oldValue) && parent?.callChildModified(newValue, oldValue); // && console.log(newValue, oldValue);
  if (getType(value) !== "primitive") {
    // Object.entries(value).forEach(([key, keyValue]) => target[key] = (keyValue != null && keyValue[Value] != null) ? applyStateWithParent(keyValue, { callChildModified: (newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue) }) : createStateFromInitValueWithParent(keyValue, { callChildModified: (newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue) }));
    // Object.entries(value).forEach(([key, keyValue]) => target[key] = (keyValue != null && keyValue[Value] != null) ? keyValue : createStateFromInitValue(keyValue));
    // Object.keys(value).forEach(_ => (value as any)[_] = (value as any)[_][Value] == null ? (value as any)[_] : (value as any)[_][Value]);
    Object.entries(value as Object).forEach(([key, keyValue]) => {
      if (keyValue != null && keyValue[Value] != null) {
        target[key] = keyValue;
        (value as any)[key] = keyValue[Value];
      }
      else {
        target[key] = createStateFromInitValue(keyValue);
      }
      target[key][Modified].on((newValue: any, oldValue: any) => target[Value][key] = target[key][Value]);
      target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => target[Value][key] = oldValue === undefined ? target[Value][key] : target[key][Value]);
      target[key][Modified].on((newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue));
      target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => callChildModified(newValue, key + '.' + _key, oldValue));
    });
  }
  return new Proxy(target, {
    get: (target, key) => {
      let resolve = (value: any, key: string | symbol): any => {
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
      // if (['fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'].includes(key as string)) {
      //   return {
      //     [Value]: (...args: Array<any>) => {
      //       let oldValue = target[Value];
      //       let result = resolve(target[Value], key).bind(target[Value])(...args);
      //       callModified(target[Value], oldValue);
      //       return result;
      //     }
      //   };
      // }
      if (key == "forEach") {
        return {
          [Value]: (callback: Parameters<Array<T>['forEach']>[0]) => {
            if (Array.isArray(target[Value]))
              return (target[Value] as Array<T>).forEach((_, i, a) => callback(target[i], i, a)); // tsc bug
          }
        };
      }
      if (key == "map") {
        return {
          [Value]: (callback: Parameters<Array<T>['map']>[0]) => {
            if (!Array.isArray(target[Value]))
              return;
            let state = createState((target[Value] as Array<T>).map((_, i, a) => callback(target[i], i, a)));
            // target[ChildModified].on(() => state[Value] = (target[Value] as Array<T>).map((_, i, a) => callback(target[i], i, a)));
            target[Modified].on(() => state[Value] = (target[Value] as Array<T>).map((_, i, a) => callback(target[i], i, a)));
            return state;
          }
        };
      }
      if (key == "filter") {
        return {
          [Value]: (callback: Parameters<Array<T>['filter']>[0]) => {
            if (!Array.isArray(target[Value]))
              return;
            let state = createState((target[Value] as Array<T>).filter((_, i, a) => callback(target[i], i, a)));
            // target[ChildModified].on(() => state[Value] = (target[Value] as Array<T>).filter((_, i, a) => callback(target[i], i, a)));
            target[Modified].on(() => state[Value] = (target[Value] as Array<T>).filter((_, i, a) => callback(target[i], i, a)));
            return state;
          }
        };
      }
      if (key == "reduce") {
        return {
          [Value]: (callback: Parameters<Array<T>['reduce']>[0]) => {
            if (!Array.isArray(target[Value]))
              return;
            let state = createState((target[Value] as Array<T>).reduce((a, b, i, arr) => callback(a, target[i], i, arr), [] as any));
            target[ChildModified].on(() => state[Value] = (target[Value] as Array<T>).reduce((a, b, i, arr) => callback(a, target[i], i, arr), [] as any));
            target[Modified].on(() => state[Value] = (target[Value] as Array<T>).reduce((a, b, i, arr) => callback(a, target[i], i, arr), [] as any));
            return state;
          }
        };
      }

      if (key == "push") {
        return {
          [Value]: (...items: Array<any>) => {
            if (!Array.isArray(target[Value])) return;
            let oldValue = target[Value];
            let result = target[Value].length;
            target[Value].push(...items);
            items.forEach(item => target[result] = createState(item));
            callModified(target[Value] as T, oldValue as T);
            callChildModified(target[Value][result], result, oldValue[result])
            return result;
          }
        };
      }
      if (key == "pop") {
        return {
          [Value]: () => {
            if (!Array.isArray(target[Value])) return;
            let oldValue = target[Value];
            let result = (target[Value] as Array<T>).pop(); // tsc bug
            callModified(target[Value] as T, oldValue as T);
            return result;
          }
        };
      }
      if (key === Value)
        callGet();
      if (key == Value || key == Get || key == Set || key == Modified || key == ChildModified || target[key] != null)
        return target[key];
      let _value = resolve(target[Value], key);
      if (_value == undefined || _value == null || _value[Value] == null)
        return { [Value]: _value };
      return _value;
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
              target[key][Modified].on((newValue: any, oldValue: any) => target[Value][key] = target[key][Value] );
              target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => target[Value][key] = oldValue === undefined ? target[Value][key] : target[key][Value]);
              target[key][Modified].on((newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue));
              target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => callChildModified(newValue, key + '.' + _key, oldValue));
            } else
              target[key] = (keyValue as any)[key];
            // console.log(keyValue as any, key, null as any);
            callChildModified(keyValue as any, key, undefined as any);
          } else
            target[key][Value] = keyValue;
          // (target as Object).hasOwnProperty()
          // if (keyValue != null && keyValue[Value] != null) {
          //   target[key] = keyValue;
          //   (value as any)[key] = keyValue[Value];
          // }
          // else {
          //   target[key] = createStateFromInitValue(keyValue);
          // }
          // target[key][Modified].on((newValue: any, oldValue: any) => target[Value][key] = target[key][Value]);
          // target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => target[Value][key] = target[key][Value]);
          // target[key][Modified].on((newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue));
          // target[key][ChildModified].on((newValue: any, _key: any, oldValue: any) => callChildModified(newValue, key, oldValue));
        });
      }
      callModified(newValue, oldValue);
      return true;
    }
  }) as unknown as State<T>;
}

// function applyStateWithParent<T>(state: T, parent?: any): T {
//   return state;
// }

function createStateFromCallback<T>(callback: () => T, dependens: Array<State<any>>): State<T> {
  let state = createStateFromInitValue(callback());
  dependens.forEach(dependen => dependen[Modified].on(() => { state[Value] = callback(); return; }));
  return state;
}

// function createStateFromCallbackWithParent<T>(callback: () => T, dependens: Array<State<any>>, parent?: any): State<T> {
// 	let state = createStateFromInitValueWithParent(callback(), parent);
// 	dependens.forEach(dependen => dependen[Modified].on(() => { state[Value] = callback(); return; }));
// 	return state;
// }

function getType(value: any): "object" | "array" | "primitive" {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || value === undefined ? "primitive" : value instanceof Array ? "array" : "object";
}

function createEvent<T extends (...args: Array<any>) => any>(name: string) {
  let callbacks: Array<{ callback: T, once?: boolean }> = [];
  let callback: (...args: Parameters<T>) => Array<ReturnType<T>> = ((...args: any) => {
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