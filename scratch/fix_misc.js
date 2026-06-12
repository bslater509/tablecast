const fs = require('fs');

function replaceFile(path, replacer) {
  if (fs.existsSync(path)) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content, 'utf8');
  }
}

// 1. backup.js
replaceFile('server/src/routes/backup.js', c => {
  c = c.replace(/case "'": return "&#39;";/g, 'case "\'": return "&#39;";\n      default: return m;');
  c = c.replace(/\[\'\\\\\\n\\r<\\\/\]/g, "['\\\\\\n\\r</]"); // /['\\\n\r<\/]/g -> /['\\\n\r</]/g
  c = c.replace(/case "\/": return "\\\\u002F";/g, 'case "/": return "\\\\u002F";\n      default: return m;');
  return c;
});

// 2. monsters.js
replaceFile('server/src/routes/monsters.js', c => c.replace(/new URL\(url\);/g, 'const _url = new URL(url);'));

// 3. npcs.js
replaceFile('server/src/routes/npcs.js', c => c.replace(/new URL\(url\);/g, 'const _url = new URL(url);'));

// 4. maps.js (assuming it's isValidImageUrl)
replaceFile('server/src/routes/maps.js', c => {
  c = c.replace(/new URL\(url\);/g, 'const _url = new URL(url);');
  c = c.replace(/\[\'\\\\\\n\\r<\\\/\]/g, "['\\\\\\n\\r</]");
  return c;
});

// 5. dialogueEngine.js
replaceFile('server/src/utils/dialogueEngine.js', c => {
  return c.replace(/const fn = new Function\(/g, '// eslint-disable-next-line no-new-func\n    const fn = new Function(');
});

// 6. referenceSearch.js
replaceFile('server/src/utils/referenceSearch.js', c => c.replace(/\\\/api\\\/reference/g, '/api/reference').replace(/\\\//g, '/'));

// 7. referenceSync.js
replaceFile('server/src/utils/referenceSync.js', c => c.replace(/\\\//g, '/'));

console.log("Misc fixes applied.");
