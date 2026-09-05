const fs = require('fs');
const path = require('path');

const podfilePath = path.resolve('artifacts/macrosnap/ios/App/Podfile');
const basePath = path.resolve('artifacts/macrosnap');

// Split a package-relative specifier like "@capacitor/ios/scripts/pods_helpers"
// into { pkg: "@capacitor/ios", rest: "scripts/pods_helpers" }, handling
// scoped (@scope/name) packages correctly.
function splitPackageAndRest(spec) {
  const parts = spec.split('/');
  if (parts[0].startsWith('@')) {
    return { pkg: parts.slice(0, 2).join('/'), rest: parts.slice(2).join('/') };
  }
  return { pkg: parts[0], rest: parts.slice(1).join('/') };
}

function resolveSubpath(subpath) {
  let cleaned = subpath.replace(/\/$/, '');

  // Capacitor's generated Podfile paths look like:
  //   .pnpm/@capacitor+ios@8.5.0_@capacitor+core@8.5.0/node_modules/@capacitor/ios/scripts/pods_helpers
  // The ".pnpm/<hash>/node_modules/" prefix encodes pnpm's internal peer-dependency
  // hash, which can drift between installs (and appears to already be stale/mismatched
  // on the Codemagic build machine, which is why this exact line keeps failing).
  // Rather than trust that hash, strip everything through the LAST "node_modules/"
  // and re-resolve just the real package + subpath fresh, ourselves.
  const lastIdx = cleaned.lastIndexOf('node_modules/');
  if (lastIdx !== -1) {
    cleaned = cleaned.slice(lastIdx + 'node_modules/'.length);
  }

  const { pkg, rest } = splitPackageAndRest(cleaned);

  let pkgDir;
  try {
    pkgDir = path.dirname(require.resolve(pkg + '/package.json', { paths: [basePath] }));
  } catch (e) {
    return null;
  }

  if (!rest) return pkgDir;

  const candidate = path.join(pkgDir, rest);
  if (fs.existsSync(candidate)) return candidate;
  // Ruby's require_relative appends .rb automatically, so files like
  // "pods_helpers" (no extension) resolve on disk as "pods_helpers.rb".
  if (fs.existsSync(candidate + '.rb')) return candidate;

  return null;
}

let content = fs.readFileSync(podfilePath, 'utf8');
const regex = /(['"])((?:\.\.\/)*node_modules\/[^'"]*)\1/g;
let hadFailure = false;

content = content.replace(regex, (match, quote, oldPath) => {
  const idx = oldPath.indexOf('node_modules/');
  const subpath = oldPath.slice(idx + 'node_modules/'.length);
  const resolved = resolveSubpath(subpath);
  if (resolved) {
    console.log(`Resolved ${subpath} -> ${resolved}`);
    return quote + resolved + quote;
  } else {
    console.log(`WARNING: could not resolve ${subpath}`);
    hadFailure = true;
    return match;
  }
});

fs.writeFileSync(podfilePath, content);
console.log('--- Final Podfile ---');
console.log(fs.readFileSync(podfilePath, 'utf8'));

if (hadFailure) {
  console.error('One or more Podfile paths could not be resolved. Failing this step so the build does not proceed with a broken Podfile.');
  process.exit(1);
}
