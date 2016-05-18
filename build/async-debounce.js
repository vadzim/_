const noop = () => {}

module.exports = cb => {
	let running = null
	let rerun = null
	const run = function () {
		rerun = { this: this, arguments: arguments }
		if ( !running )
			( running = Promise.resolve().then( () => {
				const r = rerun
				rerun = null
				return cb.apply( r.this, r.arguments )
			} ) )
			.catch( noop )
			.then( () => {
				running = null
				if ( rerun )
					run.apply( rerun.this, rerun.arguments )
			} )
		return running
	}
	return run
}

