declare type MayBePromise<T> = Promise<T> | T;
declare type MayBePromiseCalc<T> = () => MayBePromise<T>;

function noop() {}

function stopIterator( iterator ) {
	iterator.return()
}

const UNDEFINED_DONE = { done: true, value: undefined }
const UNDEFINED_NOTDONE = { done: false, value: undefined }

class Thread extends Promise {
	constructor( f: () => Generator ) {
		let kill = noop
		let resolve
		super( rs => resolve = rs )
		this._th_iterator = ( null: any )
		this._th_resolve = resolve || noop
		this._th_stack = null
		this._th_killing = null
		this._th_children = null
		this.__th_inext = value => this._th_inext( value )
		this.__th_ithrow = value => this._th_ithrow( value )
		this.__th_onsuccess = value => this._th_onsuccess( value )
		this.__th_onfailure = value => this._th_onfailure( value )
		const owner = current && ( current._th_children || ( current._th_children = new Set ) )
		if ( owner )
			owner.add( this )
		const done = () => {
			if ( owner )
				owner.delete( this )
			if ( this._th_children )
				this._th_kill_children( this._th_children )
		}
		this.then( done, done )
		Promise.resolve()
			.then( () => this._th_start( f ) )
			.then( this.__th_onsuccess, this.__th_onfailure )
	}
	cancel() {
		this.kill()
	}
	kill( reason ) {
		this._th_killing = () => {
			let i = this._th_iterator
			while ( i ) {
				try {
					if ( !i.return().done )
						reason = Promise.reject( new Error( `unbreakable iterator` ) )
				}
				catch ( error ) {
					reason = Promise.reject( error )
				}
				i = this._th_stack && this._th_stack.pop()
			}
			this._th_resolve( reason )
			return UNDEFINED_DONE
		}
		let throwing = true
		try {
			if ( this._th_children )
				this._th_kill_children( this._th_children )
			throwing = false
		}
		finally {
			if ( current === this ) {
				if ( !throwing )
					throw new Error( `killing` )
			}
			else
				this._th_killing()
		}
	}
	_th_tick( promise ) {
		promise
			.then( this.__th_inext, this.__th_ithrow )
			.then( this.__th_onsuccess, this.__th_onfailure )
	}
	_th_start( f ) {
		if ( this._th_killing )
			return this._th_killing()
		current = this
		try {
			this._th_iterator = f()
		}
		finally {
			current = null
			if ( this._th_killing )
				return this._th_killing()
		}
		return UNDEFINED_NOTDONE
	}
	_th_inext( value ) {
		if ( this._th_killing )
			return this._th_killing()
		current = this
		try {
			return this._th_iterator.next( value )
		}
		finally {
			current = null
			if ( this._th_killing )
				return this._th_killing()
		}
	}
	_th_ithrow( error ) {
		if ( this._th_killing )
			return this._th_killing()
		current = this
		try {
			return this._th_iterator.throw( error )
		}
		finally {
			current = null
			if ( this._th_killing )
				return this._th_killing()
		}
	}
	_th_onsuccess( { done, value } ) {
		if ( done ) {
			if ( this._th_stack && this._th_stack.length )
				this._th_iterator = this._th_stack.pop()
			else {
				this._th_resolve( value )
				return
			}
		}
		else if ( value != null && typeof value === `object` && typeof value.next === `function` && typeof value.throw === `function` && typeof value.return === `function` ) {
			if ( !this._th_stack )
				this._th_stack = []
			this._th_stack.push( this._th_iterator )
			this._th_iterator = value
			value = undefined
		}
		this._th_tick( Promise.resolve( value ) )
	}
	_th_onfailure( error ) {
		if ( this._th_stack && this._th_stack.length ) {
			this._th_iterator = this._th_stack.pop()
			this._th_tick( Promise.reject( error ) )
		}
		else
			this._th_resolve( Promise.reject( error ) )
	}
	_th_kill_children( children ) {
		let error = null
		for ( const child of children ) {
			try {
				child.kill( Promise.reject( new Error( `exiting parent thread` ) ) )
			}
			catch ( e ) {
				error = e
			}
		}
		if ( error )
			throw error
	}
	_th_resolve
	_th_iterator
	_th_stack: ?Array<any>
	_th_children: ?Set<Thread>
	_th_killing
	__th_inext
	__th_ithrow
	__th_onsuccess
	__th_onfailure
}

let current: ?Thread = null

export function spawn( f: () => Generator ): Thread {
	return new Thread( f )
}

