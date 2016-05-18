const Promise = require( "bluebird" )
const gulp = require( "gulp" )
const stream = require( "stream" )
const path = require( "path" )
const fs = require( "fs" )
Promise.promisifyAll( fs )


const fileList = ( mask, { directories = false, files = true } = {} ) => new Promise( ( resolve, reject ) => {
	mask = [].concat( ...[].concat( mask ).map( m => {
		if ( /\*/.test( m ) )
			return [ m ]
		else {
			let m2 = m
			if ( !/\/$/.test( m2 ) )
				m2 += `/`
			m2 += `**/*`
			return [ m, m2 ]
		}
	} ) )
	const list = []
	gulp.src( mask, { read: false } )
	.on( `data`, file => {
		if ( ( directories && files ) || ( file.isDirectory() ? directories : files ) )
			list.push( file )
	} )
	.on( `end`, () => resolve( list ) )
	.on( `error`, reject )
} )


const clean = ( mask, ...suffixes ) => {
	const list = fileList( mask ).then( list => new Map( list.map( file => [ file.relative, file ] ) ) )
	return new stream.Transform( {
		objectMode: true,
		transform( file, _, cb ) {
			list.then( list => {
				list.delete( file.relative )
				for ( const suffix of suffixes )
					list.delete( file.relative + suffix )
				cb( null, file )
			} )
		},
		flush( cb ) {
			list.then( list => Promise.all(
				[ ...list.values() ].map( file => {
					this.emit( `unlink`, file )
					return fs.unlinkAsync( file.path )
				} )
			) )
			.then( () => cb(), cb )
		},
	} )
}


module.exports = clean
