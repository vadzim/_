import { spawn } from "th"

declare type MayBePromise<T> = Promise<T> | T;
declare type MayBePromiseCalc<T> = () => MayBePromise<T>;

function isGenerator( g: any ) {
	return g != null && typeof g === `object` && typeof g.next === `function` && typeof g.throw === `function` && typeof g.return === `function`
}

class Cell<T> {

	constructor( initial: T ) {
		this._value = initial
		this._depth = 0
		this._error = null
		this._out = new Set
	}

	read(): T {
		if ( activeWatcher ) {
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

	set( value: T, error: ?Object ): void {
		if ( activeWatcher )
			throw new Error( `cannot assign a value while running a calulator` )
		if ( this._value !== value || this._error !== error ) {
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

	write( value: T ): void {
		return this.set( value, null )
	}

	throw( error: Object ): void {
		return this.set( ( null: any ), error )
	}

	_value: T
	_error: ?Object
	_depth: number
	_out: Set<Watcher>
}

const OBJECT = {}

class Watcher<T> {

	constructor( calculator: MayBePromiseCalc<T> ) {
		this._initialized = false
		this._running = null
		this._calculator = calculator
		this._cell = new Cell( ( null: any ) )
		this._in = new Set
	}

	close() {}

	read(): T {
		if ( !this._initialized )
			throw new Error( `still not initialized` )
		return this._cell.read()
	}

	calc() {
		this.unwise()
		activeWatcher = this
		this._running = OBJECT
		try {
			let ret: MayBePromise = ( null, this._calculator )()
			activeWatcher = null
			if ( isGenerator( ret ) ) {
				const g: any = ret
				ret = spawn( wrap( () => g ) )
			}
			if ( ret != null && typeof ret === `object` )
				this._running = ret
			Promise.resolve( ret ).then(
				value => {
					this._running = null
					this._initialized = true
					this._cell.write( value )
				},
				error => {
					this._running = null
					this._initialized = true
					this._cell.throw( error )
				},
			)
		}
		catch ( error ) {
			activeWatcher = null
			this._running = null
			this._initialized = true
			this._cell.throw( error )
		}
	}

	unwise() {
		for ( const cell of this._in )
			cell._out.delete( this )
		this._in.clear()
		this._cell._depth = 0
		const running = this._running
		this._running = null
		if ( running && typeof running.cancel === `function` )
			running.cancel()
	}

	_calculator: MayBePromiseCalc<T>
	_initialized: boolean
	_running: ?Object
	_cell: Cell<T>
	_in: Set<Cell>
	_next: ?Watcher<number>
}

// TODO: report a bug in syntax highlighting if type declaration lacks ending semicolon.
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

export function val<T>( initial: T ): Value<T> {
	const v = new Cell( initial )
	const ret = () => v.read()
	ret.assign = value => v.write( value )
	ret.throw = error => v.throw( error )
	return ret
}

export function run<T>( calculator: MayBePromiseCalc<T> ): Calculatable<T> {
	const w = new Watcher( calculator )
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
		activeWatcher = this._w
		try {
			return this._g.next( value )
		}
		finally {
			activeWatcher = null
		}
	}
	throw( value ) {
		activeWatcher = this._w
		try {
			return this._g.throw( value )
		}
		finally {
			activeWatcher = null
		}
	}
	return( value ) {
		activeWatcher = this._w
		try {
			return this._g.return( value )
		}
		finally {
			activeWatcher = null
		}
	}
	_g: Generator
	_w: Watcher
}

export function wrap<T: Function>( f: T ): T {
	return ( ( function () {
		let ret = f.apply( this.arguments )
		if ( activeWatcher )
			ret = new GeneratorProxy( activeWatcher, ret )
		return ret
	} : any ) : T )
}

