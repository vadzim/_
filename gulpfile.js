const Promise = require( "bluebird" )
Promise.coroutine.addYieldHandler( Promise.resolve )
const fs = require( "fs" )
Promise.promisifyAll( fs )
const path = require( "path" )
const stream = require( "stream" )
const child_process = require( "child_process" )
const lodash = require( "lodash" )
const chokidar = require( "chokidar" )
const gulp = require( "gulp" )
const babel = require( "gulp-babel" )
const filter = require( "gulp-filter" )
const insert = require( "gulp-insert" )
const newer = require( "gulp-newer" )
const sourcemaps = require( "gulp-sourcemaps" )
const gutil = require( "gulp-util" )
const clean = require( "./build/gulp-clean-removed" )
const asyncDebounce = require( "./build/async-debounce" )
const File = require( "vinyl" )
const del = require( "del" )
const mkdirp = require( "mkdirp" )
mkdirp.async = Promise.promisify( mkdirp )
const flow = require( "flow-bin" )
const webpack = require( "webpack" )
const WebpackDevServer = require( "webpack-dev-server" )
const webpackConfig = require( "./config/webpack.config.js" )
const useif = ( condition, ...items ) => condition ? items : []


const paths = webpackConfig.paths


const DEV_SERVER_PORT = 3000


const PAGER = `\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n`


const through = () => new stream.PassThrough( { objectMode: true } )


const webpackStatsConfig = {
	colors: true,
	chunkModules: false,
}


const getErrorMessage = error => {
	if ( error.stack ) {
		const ret = error.stack.split( /\r\n|\r|\n/ ).filter( s => !/^\s*at\s/.test( s ) ).join( `\n` ).trim()
		if ( ret )
			return ret
	}
	if ( error.message )
		return error.message
	return error
}


const stripESC = text => text.replace( /\x1b.*?m/g, `` )


const streamToPromise = stream => new Promise( ( resolve, reject ) => stream
	.on( `data`, _ => _ )
	.once( `end`, resolve )
	.once( `error`, reject )
)


const catchStreamError = stream => {
	const pipe = stream.pipe
	stream.pipe = function ( dest, options ) {
		stream.once( `error`, error => dest.emit( `error`, error ) )
		return catchStreamError( pipe.call( this, dest, options ) )
	}
	return stream
}


const normalizeErrorMessage = error => {
	const msg = getErrorMessage( error )
	if ( error.message !== msg )
		error = new Error( msg )
	return error
}


const printFileCmd = ( msg, file ) => gutil.log( `${ msg }: ${ gutil.colors.cyan( path.relative( paths.root, file.path ) ) }...` )


const writeFile = Promise.coroutine( function* ( filename, text ) {
	yield mkdirp.async( path.dirname( filename ) )
	yield fs.writeFileAsync( filename, text )
} )

const writeCompileLog = text => paths.compileLog && writeFile( paths.compileLog, stripESC( text ) )


const babelSyntax = [
	`syntax-flow`,
	`syntax-jsx`,

	`syntax-async-functions`,
	`syntax-async-generators`,
	`syntax-object-rest-spread`,
	`syntax-trailing-function-commas`,
	`syntax-decorators`,
]


const jsPrepare = dev => {
	const dest = dev ? paths.dev : paths.bin
	const jsFilter = filter( `**/*.js`, { restore: true } )
	return streamToPromise(
		catchStreamError( gulp.src( `${ paths.src }/**/*` ) )
		.pipe( clean( dest, `.map` ) )
		.on( `unlink`, file => printFileCmd( `Deleting`, file ) )
		.pipe( newer( dest ) )
		.on( `data`, file => dev || printFileCmd( `Compiling`, file ) )
		.pipe( jsFilter )
		.pipe( dev ? sourcemaps.init() : through() )
		.pipe( babel( {
			retainLines: true,
			plugins: [
				...babelSyntax,
				`transform-flow-strip-types`,
			],
		} ) )
		.pipe( babel( {
			plugins: [
				`transform-decorators-legacy`,
				[ `transform-async-to-module-method`, {
					module: `bluebird`,
					method: `coroutine`,
				} ],
			],
			presets: [
				`stage-0`,
				`react`,
				...useif( dev,
					`react-hmre`
				),
				`es2015`,
			],
		} ) )
		.pipe( dev ? sourcemaps.write( `.` ) : through() )
		.pipe( jsFilter.restore )
		.pipe( gulp.dest( dest ) )
	)
}


const flowPrepare = () => {
	const jsFilter = filter( `**/*.js`, { restore: true } )
	return streamToPromise(
		catchStreamError( gulp.src( `${ paths.src }/**/*.{js,json}` ) )
		.pipe( clean( paths.flow ) )
		.on( `unlink`, file => printFileCmd( `Deleting`, file ) )
		.pipe( newer( paths.flow ) )
		.on( `data`, file => printFileCmd( `To flow`, file ) )
		.pipe( jsFilter )
		.pipe( babel( {
			retainLines: true,
			plugins: [
				...babelSyntax,
				`transform-exponentiation-operator`,
			],
		} ) )
		.pipe( insert.transform( contents => `/*@flow*/${ contents.replace( /\[\s*Symbol\s*\.\s*iterator\s*\]\s*\(\s*\)\s*\{/g, `@@iterator(){` ) }` ) )
		.pipe( jsFilter.restore )
		.pipe( gulp.dest( paths.flow ) )
	)
}


const flowRun = () => new Promise( ( resolve, reject ) =>
	child_process.execFile( flow, [ `check`, `--color`, `always`, paths.flowConfig ], ( error, stdout, stderr ) => {
		if ( error || stderr )
			return reject( new gutil.PluginError( `flow`, stderr || stdout ? stderr + stdout : error ) )
		gutil.log( `[flow]`, stdout )
		resolve()
	} )
)


const js = Promise.coroutine( function* () {
	yield jsPrepare( false )
	yield flowPrepare()
	yield flowRun()
} )


const webpackRun = config => new Promise( ( resolve, reject ) =>
	webpack( config, ( error, stats ) => {
		if ( error )
			reject( new gutil.PluginError( `webpack`, error ) )
		else {
			const message = stats.toString( webpackStatsConfig )
			if ( stats.hasErrors() )
				reject( new gutil.PluginError( `webpack`, new Error( message ) ) )
			else
				resolve( gutil.log( `[webpack]`, message ) )
		}
	} )
)


const webpackDevServerRun = lodash.once( () =>
	new WebpackDevServer( webpack( webpackConfig.createApp( DEV_SERVER_PORT ) ), {
		hot: true,
		stats: webpackStatsConfig,
	} )
	.listen( DEV_SERVER_PORT, `localhost`, error => {
		if ( error )
			return ret.emit( `error`, new gutil.PluginError( `webpack-dev-server`, error ) )
		gutil.log( `[webpack-dev-server]`, `http://localhost:${ DEV_SERVER_PORT }`, `http://localhost:${ DEV_SERVER_PORT }/webpack-dev-server/index.html` )
	} )
)


gulp.task( `clear`, () => del( [ paths.flow, ...paths.dirsToClean, ] ) )


gulp.task( `default`, [ `clear` ], Promise.coroutine( function* () {
	yield js()
	yield webpackRun( webpackConfig )
} ) )


const compile = Promise.coroutine( function* () {
	if ( PAGER )
		console.log( PAGER )
	try {
		yield writeCompileLog( `Compiling...` )
		yield js()
		yield jsPrepare( true )
		yield webpackRun( webpackConfig.createServer() )
		webpackDevServerRun()
		yield writeCompileLog( `Success.` )
	}
	catch ( error ) {
		error = normalizeErrorMessage( error )
		yield writeCompileLog( `Errors:\n${ error.message }` )
		throw error
	}
} )
gulp.task( `compile`, compile )


const watch = ( files, cb ) => chokidar.watch( files ).on( `ready`, function () { this.on( `all`, cb ) } )


gulp.task( `dev`, [ `clear` ], () => {
	watch( [
		__filename,
		...Object.keys( require.cache ),
	], ( event, filename ) => {
		gutil.log( `Aborting: ${ gutil.colors.cyan( path.relative( paths.root, filename ) ) } has been touched.` )
		setTimeout( () => process.exit( 1 ), 200 )
	} )

	const compiler = asyncDebounce( () => compile().catch( error => gutil.log( error.message ) ) )

	watch( [ paths.src, paths.flowConfig ], compiler )
	compiler()
} )

