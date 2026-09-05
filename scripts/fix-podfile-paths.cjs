const fs = require('fs');
const path = require('path');

const podfilePath = path.resolve('artifacts/macrosnap/ios/App/Podfile');
const basePath = path.resolve('artifacts/macrosnap');

function resolveSubpath(subpath) {
  const cleaned = subpath.replace(/\/$/, '');
  try {
    const pkgJsonPath = require.resolve(cleaned + '/package.json', { paths: [basePath] });
    return path.dirname(pkgJsonPath);
  } catch (e) {
    try {
      return require.resolve(cleaned, { paths: [basePath] });
    } catch (e2) {
      try {
        return require.resolve(cleaned + '.rb', { paths: [basePath] });
      } catch (e3) {
        return null;
      }
    }
  }
}

let content = fs.readFileSync(podfilePath, 'utf8');
const regex = /(['"])((?:\.\.\/)*node_modules\/[^'"]*)\1/g;

content = content.replace(regex, (match, quote, oldPath) => {
  const idx = oldPath.indexOf('node_modules/');
  const subpath = oldPath.slice(idx + 'node_modules/'.length);
  const resolved = resolveSubpath(subpath);
  if (resolved) {
    console.log(`Resolved ${subpath} -> ${resolved}`);
    return quote + resolved + quote;
  } else {
    console.log(`WARNING: could not resolve ${subpath}`);
    return match;
  }
});

fs.writeFileSync(podfilePath, content);
console.log('--- Final Podfile ---');
console.log(fs.readFileSync(podfilePath, 'utf8'));