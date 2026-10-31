module.exports = { apps: [{ name: 'warminbox-mcp', cwd: __dirname, script: 'dist/node.js', env: { NODE_ENV: 'production', PORT: '3100' }, time: true }] };
