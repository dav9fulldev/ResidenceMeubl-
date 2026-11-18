const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Charger client/.env (sans écraser les variables déjà définies, ex. sur Vercel)
const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

// Copier public/ (images, vidéos, favicon...) dans dist/ au build, sauf index.html
class CopyPublicPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyPublicPlugin', () => {
      const from = path.resolve(__dirname, 'public');
      const to = compiler.options.output.path;
      fs.cpSync(from, to, {
        recursive: true,
        filter: (src) => path.basename(src) !== 'index.html',
      });
    });
  }
}

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? 'bundle.[contenthash].js' : 'bundle.js',
      chunkFilename: isProduction ? '[name].[contenthash].js' : '[name].js',
      publicPath: '/',
      clean: true,
    },
    mode: isProduction ? 'production' : 'development',
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            {
              loader: 'css-loader',
              // Les adresses « /images/… » pointent vers public/ (copié tel quel) : ne pas les embarquer
              options: { url: { filter: (url) => !url.startsWith('/') } },
            },
          ]
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif|mp4)$/i,
          type: 'asset/resource'
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html'
      }),
      new webpack.DefinePlugin({
        'process.env.REACT_APP_API_URL': JSON.stringify(process.env.REACT_APP_API_URL || ''),
      }),
      ...(isProduction ? [new CopyPublicPlugin()] : []),
    ],
    devServer: {
      port: Number(process.env.PORT) || 3001,
      historyApiFallback: true,
      open: true
    }
  };
};
