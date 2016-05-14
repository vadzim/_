const path = require( "path" )
const webpack = require( "webpack" )
const HtmlWebpackPlugin = require( "html-webpack-plugin" )
const OfflinePlugin = require( "offline-plugin" )
const useif = ( condition, ...items ) => condition ? items : []


const root = path.resolve( `${ __dirname }/..` )
const paths = {
	root,
	context: `${ root }/src`,
	dist: `${ root }/dist`,
}


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
	{
		test: /\.jsx?$/,
		exclude: /(node_modules|bower_components)/,
		loader: `babel`,
		query: {
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
				...useif( DEV_SERVER_PORT,
					`react-hmre`
				),
				`es2015`,
			],
		}
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
	context: paths.context,
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
		root: paths.context,
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
	context: paths.context,
	entry: {
		server: [ ...commonPolyfills, `./server.js` ],
	},
	output: {
		path: paths.dist,
		filename: `[name].js`,
	},
	resolve: {
		root: paths.context,
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
exports.root = paths.root
exports.context = paths.context
exports.dirsToClean = [ paths.dist ]
