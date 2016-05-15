declare type MayBePromise<T> = Promise<T> | T;
declare type MayBePromiseCalc<T> = () => MayBePromise<T>;

function noop() {}

function stopIterator( iterator ) {
	iterator.return()
}

class Thread extends Promise {
	constructor( f: () => Generator, context: any ) {
		let kill = noop
		super( ( resolve, reject ) => {
			let iterator = f.call( context )
			let stack: ?Array<any>
			let active = false
			let killing
			const tick = promise => promise.then( inext, ithrow ).then( onsuccess, onfailure )
			const inext = value => {
				if ( !iterator )
					return killing()
				const old = current
				current = this
				active = true
				try {
					return iterator.next( value )
				}
				finally {
					current = old
					active = false
					if ( killing )
						return killing()
				}
			}
			const ithrow = error => {
				if ( !iterator )
					return killing()
				const old = current
				current = this
				active = true
				try {
					return iterator.throw( error )
				}
				finally {
					current = old
					active = false
					if ( killing )
						return killing()
				}
			}
			const onsuccess = result => {
				const done = result.done
				let value = result.value
				if ( done ) {
					if ( stack && stack.length )
						iterator = stack.pop()
					else {
						resolve( value )
						return
					}
				}
				else if ( value != null && typeof value === `object` && typeof value.next === `function` && typeof value.throw === `function` && typeof value.return === `function` ) {
					if ( !stack )
						stack = []
					stack.push( iterator )
					iterator = value
					value = undefined
				}
				tick( Promise.resolve( value ) )
			}
			const onfailure = error => {
				if ( stack && stack.length ) {
					iterator = stack.pop()
					tick( Promise.reject( error ) )
				}
				else
					reject( error )
			}
			kill = reason => {
				killing = () => {
					while ( iterator ) {
						try {
							if ( !iterator.return().done )
								reason = Promise.reject( new Error( `unbreakable iterator` ) )
						}
						catch ( error ) {
							reason = Promise.reject( error )
						}
						iterator = stack && stack.pop()
					}
					resolve( reason )
					return { done: true, value: null }
				}
				self._killChildren()
				if ( active )
					throw new Error( `killing` )
				else
					killing()
			}
			tick( Promise.resolve( undefined ) )
		} )
		const self = this
		if ( current ) {
			const owner = current._children || ( current._children = new Set )
			owner.add( this )
			const done = () => {
				owner.delete( this )
				if ( this._children )
					this._killChildren()
			}
			this.then( done, done )
		}
		this.kill = kill
		this._children = null
	}
	cancel() {
		this.kill()
	}
	_killChildren() {
		if ( this._children ) {
			for ( const child of this._children )
				child.kill( Promise.reject( new Error( `exiting parent thread` ) ) )
			this._children.clear()
		}
	}
	kill: ( reason: any ) => void
	_children: ?Set<Thread>
}

let current: ?Thread = null

export function spawn( f: () => Generator ): Thread {
	return new Thread( f, this )
}

