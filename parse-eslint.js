import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("eslint-report.json", "utf8"));
const filesWithErrors = data.filter(file => file.errorCount > 0);
let output = "";
filesWithErrors.forEach(f => {
  output += "FILE: " + f.filePath + "\n";
  f.messages.forEach(m => {
    output += "  - [" + m.ruleId + "] Line " + m.line + ": " + m.message + "\n";
  });
});
fs.writeFileSync("eslint-summary.txt", output);
