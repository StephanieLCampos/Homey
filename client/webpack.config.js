/**
 * WEBPACK CONFIGURATION
 *
 * Builds the client into client/dist/bundle.js, which server/index.js then
 * serves statically alongside the API.
 *
 * Three loaders cover the source tree: ts-loader compiles .ts/.tsx, style-loader
 * and css-loader inline the stylesheet, and the `asset/resource` rule emits
 * images as separate files whose URLs are substituted into the import - which is
 * what makes the declarations in src/types/images.d.ts true at runtime.
 * HtmlWebpackPlugin writes dist/index.html from the public/ template with the
 * bundle script tag injected.
 *
 * The devServer block is what makes local development work without CORS: the
 * client is served on :3000 and every /api request is proxied to the backend on
 * :3333, so the browser sees a single origin. That proxy is also why the client
 * can address the API with relative paths in both environments.
 *
 * Usage (from client/): `npm run build` for production, `npm start` for the dev
 * server.
 *
 * Connections:
 *   - client/src/index.tsx      - the entry point.
 *   - client/public/index.html  - the HTML template.
 *   - client/tsconfig.json      - compiler options used by ts-loader.
 *   - server/index.js           - serves the resulting bundle, and is the proxy
 *                                 target below.
 *
 * Note: the proxy target is hard-coded to port 3333, which must match the PORT
 * in server/.env.
 */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: true,
    port: 3000,
    hot: true,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    ],
  },
};
