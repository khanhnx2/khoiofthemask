// Copies runtime resources (audio) next to the preview page so resources.load can fetch them.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
fs.cpSync(path.join(root, 'assets', 'resources', 'audio'), path.join(__dirname, 'www', 'res', 'audio'), {
    recursive: true,
    filter: (src) => !src.endsWith('.meta'),
});
