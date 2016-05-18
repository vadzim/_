const path = require( "path" )
const webpack = require( "webpack" )
const HtmlWebpackPlugin = require( "html-webpack-plugin" )
const OfflinePlugin = require( "offline-plugin" )
const useif = ( condition, ...items ) => condition ? items : []


const paths = {}
paths.root = path.resolve( `${ __dirname }/..` )
paths.src = `${ paths.root }/src`
paths.tmp = `${ paths.root }/.compiled`
paths.compileLog =`${ paths.tmp }/compiler.log`
paths.dev = `${ paths.tmp }/dev`
paths.bin = `${ paths.tmp }/bin`
paths.flow = `${ paths.tmp }/compiled_flow_modules`
paths.flowConfig = `${ paths.root }/config/.flowconfig`
paths.dist = `${ paths.root }/dist`
paths.dirsToClean = [ paths.tmp, paths.dist ]


const commonPolyfills = [ `babel-polyfill` ]


const preLoaders = [
	{
		// disable loading of modules outside of root directory
		test: /(?:)/,
		exclude: paths.root,
		loader: () => { throw new Error( `This file cannot be loaded.` ) },
	},
	{
		test: /\.js$/,
		exclude: /(node_modules|bower_components)/,
		loader: `source-map-loader`,
	},
]


const loaders = DEV_SERVER_PORT => [
	{
		test: /\.json$/,
		loader: `json`,
	},
]


const commonPlugins = [
	new webpack.ProvidePlugin( {
		React: `react`,
		Promise: `bluebird`,
		autobind: `autobind-decorator`,
	} ),
]

const createApp = DEV_SERVER_PORT => [ {
	context: DEV_SERVER_PORT ? paths.dev : paths.bin,
	entry: [
		...useif( DEV_SERVER_PORT,
			`webpack-dev-server/client?http://localhost:${ DEV_SERVER_PORT }/`,
			`webpack/hot/dev-server`
		),
		...commonPolyfills,
		`./app/index.js`,
	],
	output: {
		path: paths.dist,
	},
	resolve: {
		root: DEV_SERVER_PORT ? paths.dev : paths.bin,
	},
	target: `web`,
	module: {
		preLoaders,
		loaders: loaders( DEV_SERVER_PORT ),
	},
	devtool: DEV_SERVER_PORT ? `eval-source-map` : undefined,
	plugins: [
		...useif( DEV_SERVER_PORT,
			new webpack.HotModuleReplacementPlugin
		),
		...commonPlugins,
		new HtmlWebpackPlugin( {
			title: `Application`,
			template: `./app/index.ejs`,
			// favicon: `favicon.ico`,
			xhtml: true,
		} ),
		// new OfflinePlugin,
	],
} ]

const createServer = () => [ {
	context: paths.bin,
	entry: {
		server: [ ...commonPolyfills, `./server.js` ],
	},
	output: {
		path: paths.dist,
		filename: `[name].js`,
	},
	resolve: {
		root: paths.bin,
	},
	target: `node`,
	module: {
		preLoaders,
		loaders: loaders(),
	},
	plugins: [
		...commonPlugins,
	],
	node: {
		__filename: true,
	},
} ]

module.exports = exports = [
	...createApp( null ),
	...createServer(),
]
exports.createApp = createApp
exports.createServer = createServer
exports.paths = paths
