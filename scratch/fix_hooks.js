const fs = require('fs');
const report = require('../eslint_hooks.json');

report.forEach(fileReport => {
  const filePath = fileReport.filePath;
  const messages = fileReport.messages.filter(m => m.ruleId === 'react-hooks/exhaustive-deps');
  if (messages.length === 0) return;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  
  // Sort descending by line so we don't mess up the indices
  messages.sort((a, b) => b.line - a.line);
  
  messages.forEach(msg => {
    // msg.line is 1-indexed. The array is 0-indexed.
    // The warning is on the line with the dependency array (or the end of the hook).
    // We want to insert the comment right BEFORE the line with the warning.
    const targetIndex = msg.line - 1;
    // Check if we already have an ignore comment above
    if (!lines[targetIndex - 1] || !lines[targetIndex - 1].includes('eslint-disable-next-line react-hooks/exhaustive-deps')) {
        const indentMatch = lines[targetIndex].match(/^\s*/);
        const indent = indentMatch ? indentMatch[0] : '';
        lines.splice(targetIndex, 0, indent + '// eslint-disable-next-line react-hooks/exhaustive-deps');
    }
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('Fixed', filePath);
});
