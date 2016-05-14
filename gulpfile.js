const Promise = require( "bluebird" )
const path = require( "path" )
const stream = require( "stream" )
const child_process = require( "child_process" )
const lodash = require( "lodash" )
const gulp = require( "gulp" )
const babel = require( "gulp-babel" )
const filter = require( "gulp-filter" )
const insert = require( "gulp-insert" )
const newer = require( "gulp-newer" )
const plumber = require( "gulp-plumber" )
const gutil = require( "gulp-util" )
const watch = require( "gulp-watch" )
const del = require( "del" )
const flow = require( "flow-bin" )
const webpack = require( "webpack" )
const WebpackDevServer = require( "webpack-dev-server" )
const webpackConfig = require( "./config/webpack.config.js" )


const paths = {
	root: webpackConfig.root,
	src: `${ webpackConfig.context }/**/*.{js,json}`,
	flow: `${ webpackConfig.root }/.compiled/compiled_flow_modules`,
	flowConfig: `${ webpackConfig.root }/config/.flowconfig`,
}


const DEV_SERVER_PORT = 3000


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


const toPromise = value => Promise.resolve( value ).then( value =>
	value && typeof value.pipe === `function` && typeof value.on === `function`
	? new Promise( ( resolve, reject ) => value
		.on( `data`, _ => _ )
		.on( `end`, resolve )
		.on( `error`, reject )
	)
	: value
)


const flowPrepare = () => {
	const jsFilter = filter( `**/*.js`, { restore: true } )
	return toPromise(
		gulp.src( paths.src )
		.pipe( plumber( { errorHandler( error ) { gutil.log( getErrorMessage( error ) ) } } ) )
		.pipe( newer( paths.flow ) )
		.pipe( through().on( `data`, file =>
			gutil.log( `Compiling: ${ gutil.colors.cyan( path.relative( webpackConfig.root, file.path ) ) } ...` )
		) )
		.pipe( jsFilter )
		.pipe( babel( {
			plugins: [
				`syntax-flow`,
				`syntax-jsx`,

				`syntax-async-functions`,
				`syntax-async-generators`,
				`syntax-object-rest-spread`,
				`syntax-trailing-function-commas`,
				`syntax-decorators`,

				`transform-exponentiation-operator`,
			],
		} ) )
		.pipe( insert.prepend( `/*@flow*/` ) )
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


const flowCheck = Promise.coroutine( function* () {
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


gulp.task( `clean`, () => del( [ paths.flow, ...webpackConfig.dirsToClean, ] ) )


gulp.task( `default`, [ `clean` ], Promise.coroutine( function* () {
	yield flowCheck()
	yield webpackRun( webpackConfig )
} ) )


const compile = Promise.coroutine( function* () {
	yield flowCheck()
	yield webpackRun( webpackConfig.createServer() )
	webpackDevServerRun()
} )
gulp.task( `compile`, compile )


gulp.task( `dev`, [ `clean` ], Promise.coroutine( function* () {
	gulp.watch( [
		__filename,
		...Object.keys( require.cache ),
	], data => {
		if ( data.type === `added` )
			return
		gutil.log( `Aborting: ${ gutil.colors.cyan( path.relative( webpackConfig.root, data.path ) ) } has been ${ gutil.colors.red( data.type ) }.` )
		setTimeout( () => process.exit( 1 ), 200 )
	} )
	yield compile().catch( error => gutil.log( getErrorMessage( error ) ) )
	gulp.watch( [
		paths.src,
		paths.flowConfig,
	], [ `compile` ] )
} ) )

