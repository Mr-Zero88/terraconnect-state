export const Value = Symbol("Value");
export const Get = Symbol("Get");
export const Set = Symbol("Set");
export const Modified = Symbol("Modified");
export const ChildModified = Symbol("ChildModified");

export type GetEvent = () => void;
export type SetEvent = (newValue: any, oldValue: any) => boolean | void;
export type ModifiedEvent = (newValue: any, oldValue: any) => boolean | void;
export type ChildModifiedEvent = (newValue: any, key: any, oldValue: any) => boolean | void;
export type Event<T> = { on: (callback: T) => void, off: (callback: T) => void, once: (callback: T) => void };
export type StateSymboles<T> = { [Value]: T, [Get]: Event<GetEvent>, [Set]: Event<SetEvent>, [Modified]: Event<ModifiedEvent>, [ChildModified]: Event<ChildModifiedEvent> }
export type State<T> = StateSymboles<T> & (T extends { [Value]: any } ? T : (T extends Array<any> ? { [P in keyof T]: State<T[P]> } & {push: { [Value]: typeof Array.prototype.push}, map: { [Value]: typeof Array.prototype.map}} : (T extends { [key: string | number | symbol]: any } ? { [P in keyof T]: State<T[P]> } : ({}))));

export function createState<T>(initialValue: T): State<T>;
export function createState<T>(callback: () => T, dependens: Array<State<any>>): State<T>;
export function createState<T>(arg1: () => T | T, arg2?: undefined | Array<State<any>>): State<T> {
	return arg2 !== undefined ? createStateFromCallbackWithParent<T>(arg1, arg2) : createStateFromInitValueWithParent<T>(arg1 as unknown as T, null);
}

function createStateFromInitValueWithParent<T>(value: T, parent?: any): State<T> {
	let taget: any = { [Value]: value };
	let [, callGet] = [taget[Get]] = createEvent<GetEvent>("Get");
	let [, callSet] = [taget[Set]] = createEvent<SetEvent>("Set");
	let [, _callModified] = [taget[Modified]] = createEvent<ModifiedEvent>("Modified");
	let [, callChildModified] = [taget[ChildModified]] = createEvent<ChildModifiedEvent>("ChildModified");
	let callModified = (...[newValue, oldValue]: Parameters<typeof _callModified>) => _callModified(newValue, oldValue) && parent?.callChildModified(newValue, oldValue); // && console.log(newValue, oldValue);
	if (getType(value) !== "primitive")
		Object.entries(value).forEach(([key, keyValue]) => taget[key] = keyValue != null && keyValue[Value] != null ? keyValue : createStateFromInitValueWithParent(keyValue, { callChildModified: (newValue: any, oldValue: any) => callChildModified(newValue, key, oldValue) }));
	return new Proxy(taget, {
		get: (target, key) => {
			let resolve = (value: any, key: string | symbol): any => {
				if (value[key])
					return value[key];
				if (Object.getPrototypeOf(value) !== null) {
					let _ = resolve(Object.getPrototypeOf(value), key);
					if (typeof _ === 'function')
						return _.bind(value);
					return _;
				}
				return null;
			}
			if(['fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'].includes(key as string)) {
				return { [Value]: (...args: Array<any>) => {
					let oldValue = target[Value];
					let result = resolve(target[Value], key).bind(target[Value])(...args);
					callModified(target[Value], oldValue);
					return result;
				}};
			}
			if (key === Value)
				callGet();
			if(key == Value || key == Get || key == Set || key == Modified || key == ChildModified || target[key] != null)
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
			if (oldValue == newValue)
				return true;
			if (callSet(newValue, oldValue).some(v => !v))
				return false;
			target[Value] = newValue;
			callModified(newValue, oldValue);
			return true;
		}
	}) as unknown as State<T>;
}

function createStateFromCallbackWithParent<T>(callback: () => T, dependens: Array<State<any>>, parent?: any): State<T> {
	let state = createStateFromInitValueWithParent(callback(), parent);
	dependens.forEach(dependen => dependen[Modified].on(() => { state[Value] = callback(); return; }));
	return state;
}


let stateSymboleCache: { [key: symbol]: { state: State<any>, callbacks: Array<any> } } = {};

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