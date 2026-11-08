// Prepares tools/web-preview/www before bundling:
//  1. copies runtime audio so resources.load can fetch it,
//  2. writes sw.js with a fresh version and the list of files to cache offline.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const www = path.join(__dirname, 'www');

fs.cpSync(path.join(root, 'assets', 'resources', 'audio'), path.join(www, 'res', 'audio'), {
    recursive: true,
    filter: (src) => !src.endsWith('.meta'),
});

const pkg = require(path.join(root, 'package.json'));
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const version = `${pkg.version || '1.0.0'}-${sha || 'local'}-${stamp}`;

const list = (dir) => fs.readdirSync(path.join(www, dir)).map((f) => `${dir}/${f}`);
const assets = ['./', 'index.html', 'game.js', 'manifest.webmanifest', ...list('icons'), ...list('res/audio')];

const template = fs.readFileSync(path.join(__dirname, 'sw-template.js'), 'utf8');
fs.writeFileSync(
    path.join(www, 'sw.js'),
    template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets, null, 4)),
);
console.log(`www prepared, version ${version}, ${assets.length} files cached offline`);
