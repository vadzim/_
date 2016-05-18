import { spawn } from "th"

// TODO: report a bug in syntax highlighting if type declaration lacks ending semicolon.
declare type MayBePromise<T> = Promise<T> | T;
declare type MayBePromiseCalc<T> = () => MayBePromise<T>;
declare type IsEqual<T> = ( a: T, b: T ) => boolean;

function isGenerator( g: any ) {
	return g != null && typeof g === `object` && typeof g.next === `function` && typeof g.throw === `function` && typeof g.return === `function`
}

class Child<P: Parent> {
	constructor( owner: ?P ) {
		this._owner = owner
		if ( owner )
			( owner._children || ( owner._children = [] ) ).push( this )
	}
	close() {
	}
	_owner
}

class Parent<P: Parent, C: Child> extends Child<P> {
	constructor( owner: ?P ) {
		super( owner )
		this._children = null
	}
	close() {
		this.closeChildren()
		super.close()
	}
	closeChildren() {
		if ( this._children ) {
			for ( const child of this._children )
				child.close()
			this._children.length = 0
		}
	}
	_children: ?Array<C>
}

class Cell<T> extends Child<Watcher> {

	constructor( initial: T, error: ?Object, isEqual: IsEqual<T>, owner = activeWatcher ) {
		super( owner )
		this._isEqual = isEqual
		this._value = initial
		this._error = error
		this._depth = 0
		this._out = new Set
	}

	read(): T {
		if ( activeWatcher && activeWatcher !== this._owner ) {
			this._out.add( activeWatcher )
			activeWatcher._in.add( this )
			if ( activeWatcher._cell._depth <= this._depth )
				activeWatcher._cell._depth = this._depth + 1
		}
		if ( this._error )
			throw this._error
		else
			return this._value
	}

	_store( value: T, error: ?Object ): void {
		if ( error ? this._error !== error : !this._isEqual( this._value, value ) ) {
			this._value = value
			this._error = error
			if ( this._out.size > 0 ) {
				for ( const watcher of this._out ) {
					const depth = watcher._cell._depth
					watcher.unwise()
					if ( startTick > depth )
						startTick = depth
					let t = ticks[ depth ]
					if ( t == null )
						t = ticks[ depth ] = new Queue
					t.push( watcher )
				}
				scheduleTicks()
			}
		}
	}

	changing() {
		if ( activeWatcher !== this._owner )
			throw new Error( `cannot assign a value while running a calulator` )
	}

	write( value: T ): void {
		this.changing()
		return this._store( value, null )
	}

	throw( error: Object ): void {
		this.changing()
		return this._store( ( null: any ), error )
	}

	close() {
		this._store( ( null: any ), new Error( `closed` ) )
		super.close()
	}

	_value: T
	_error: ?Object
	_depth: number
	_out: Set<Watcher>
	_isEqual: IsEqual<T>
}

const OBJECT = {}

class Watcher<T> extends Parent<Watcher, Child> {

	constructor( calculator: MayBePromiseCalc<T>, isEqual: IsEqual<T>, owner = activeWatcher ) {
		super( owner )
		this._running = null
		this._calculator = calculator
		this._cell = new Cell( ( ( null: any ): T ), new Error( `not initialized` ), isEqual, null )
		this._in = new Set
	}

	close() {
		this.unwise()
		this._cell.close()
		super.close()
	}

	read(): T {
		return this._cell.read()
	}

	calc() {
		this.unwise()
		this._running = OBJECT
		try {
			let ret
			const old = activeWatcher
			activeWatcher = this
			try {
				ret = ( ( null, this._calculator )(): any )
			}
			finally {
				activeWatcher = old
			}
			if ( isGenerator( ret ) ) {
				const g = ( new GeneratorProxy( this, ( ret: any ) ): any )
				ret = spawn( () => g )
			}
			if ( ret != null && typeof ret === `object` )
				this._running = ret
			Promise.resolve( ret ).then(
				value => {
					this._running = null
					this._cell._store( value, null )
				},
				error => {
					this._running = null
					this._cell._store( ( null: any ), error )
				},
			)
		}
		catch ( error ) {
			this._running = null
			this._cell._store( ( null: any ), error )
		}
	}

	unwise() {
		this.closeChildren()
		for ( const cell of this._in )
			cell._out.delete( this )
		this._in.clear()
		this._cell._depth = 0
		const running = this._running
		this._running = null
		if ( running && typeof running.then === `function` && typeof running.cancel === `function` )
			running.cancel()
	}

	_calculator: MayBePromiseCalc<T>
	_running: ?Object
	_cell: Cell<T>
	_in: Set<Cell>
	_next: ?Watcher<number>
}

declare type QueueNext<T> = T & { _next: ?QueueNext<T> };

class Queue<T> {

	constructor() {
		this._first = null
		this._last = null
		this.length = 0
	}

	push( item: QueueNext<T> ) {
		if ( this._last )
			this._last._next = item
		else
			this._first = item
		this._last = item
		++this.length
	}

	shift(): T {
		const ret = this._first
		if ( ret == null )
			throw new Error( `no items` )
		this._first = ret._next
		if ( this._first == null )
			this._last = null
		--this.length
		ret._next = null
		return ret
	}

	length: number
	_first: ?QueueNext<T>
	_last: ?QueueNext<T>
}

// TODO: report a bug in babel. Following line does not restored properly after parsing and generating code back:
// const ticks: Array<?Queue<Watcher>> = []
const ticks: Array<null|Queue<Watcher>> = []
let startTick: number = 0
let activeWatcher: ?Watcher = null
let scheduled: boolean = false

function scheduleTicks() {
	if ( !scheduled ) {
		scheduled = true
		process.nextTick( processTicks )
	}
}

function processTicks() {
	scheduled = false
	while ( startTick < ticks.length ) {
		const t = ticks[ startTick ]
		if ( t == null || t.length === 0 )
			++startTick
		else {
			const watcher = t.shift()
			scheduleTicks()
			watcher.calc()
		}
	}
}

declare type Value<T> = {
	(): T,
	assign: ( value: T ) => void,
	throw: ( error: Object ) => void,
};

declare type Calculatable<T> = {
	(): T,
	close: () => void,
};

// TODO: report a bug in babel. Following line does not restored properly after parsing and generating code back:
// export function val<T>( initial: T, isEqual: IsEqual<T> = Object.is ): Value<T> {}
// is reproduced as
// export function val<T>( initial: T, isEqual = Object.is ): Value<T> {}
// Type declaration 'IsEqual<T>' is removed.
// Workaround is to declare type via comment.

export function val<T>( initial: T, isEqual/*: IsEqual<T>*/ = Object.is ): Value<T> {
	const v = new Cell( initial, null, isEqual )
	const ret = () => v.read()
	ret.assign = value => v.write( value )
	ret.throw = error => v.throw( error )
	return ret
}

export function run<T>( calculator: MayBePromiseCalc<T>, isEqual/*: IsEqual<T>*/ = Object.is ): Calculatable<T> {
	const w = new Watcher( calculator, isEqual )
	const ret = () => w.read()
	ret.close = () => w.close()
	return ret
}

class GeneratorProxy {
	constructor( w: Watcher, g: Generator ) {
		this._g = g
		this._w = w
	}
	[ Symbol.iterator ]() {
		return this
	}
	next( value ) {
		const old = activeWatcher
		activeWatcher = this._w
		try {
			return this._g.next( value )
		}
		finally {
			activeWatcher = old
		}
	}
	throw( value ) {
		const old = activeWatcher
		activeWatcher = this._w
		try {
			return this._g.throw( value )
		}
		finally {
			activeWatcher = old
		}
	}
	return( value ) {
		const old = activeWatcher
		activeWatcher = this._w
		try {
			return this._g.return( value )
		}
		finally {
			activeWatcher = old
		}
	}
	_g: Generator
	_w: Watcher
}

export function wrap<T: Function>( f: T ): T {
	return ( ( function () {
		let ret = f.apply( this.arguments )
		if ( activeWatcher )
			ret = ( new GeneratorProxy( activeWatcher, ( ret : any ) ): any )
		return ret
	} : any ) : T )
}

