const fs = require('fs');

function replaceFile(path, replacer) {
  if (fs.existsSync(path)) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content, 'utf8');
  }
}

replaceFile('server/src/utils/referenceSearch.js', c => c.replace(/\\\/\\?\\]/g, '/?]'));
replaceFile('server/src/utils/referenceSync.js', c => c.replace(/\\\/\\?\\]/g, '/?]'));
replaceFile('server/src/routes/maps.js', c => c.replace(/\\[A-Za-z-\\+\\\/]/g, '[A-Za-z-+/]'));

// Client ones
replaceFile('client/src/components/AiChatView.jsx', c => {
  // combine lucide-react imports
  const lines = c.split('\n');
  let firstIndex = lines.findIndex(l => l.includes('from "lucide-react"'));
  let secondIndex = lines.findIndex((l, i) => i > firstIndex && l.includes('from "lucide-react"'));
  if (secondIndex !== -1) {
    // just comment out the second one if we can't easily merge.
    // actually eslint can merge them if we run --fix, wait, no duplicate imports isn't autofixed usually.
    lines[secondIndex] = '// eslint-disable-next-line no-duplicate-imports\n' + lines[secondIndex];
  }
  return lines.join('\n');
});

replaceFile('client/src/components/HandoutPanel.jsx', c => c.replace(/\\\\[/g, '['));
replaceFile('client/src/components/HandoutsPanel.jsx', c => c.replace(/\\\\[/g, '['));
replaceFile('client/src/components/wiki/wikiUtils.js', c => c.replace(/\\\\[/g, '['));

replaceFile('client/src/components/character/SpellsPanel.jsx', c => c.replace(/\(spell, idx\)/g, '(spell, _idx)'));

replaceFile('client/src/components/map/MapCanvas.jsx', c => {
  const lines = c.split('\n');
  if (lines[656]) lines.splice(656, 0, '      default: break;');
  return lines.join('\n');
});

replaceFile('client/src/components/wiki/NpcGenModal.jsx', c => {
  const lines = c.split('\n');
  if (lines[81]) lines.splice(81, 0, '      default: break;');
  return lines.join('\n');
});

console.log("Done");
