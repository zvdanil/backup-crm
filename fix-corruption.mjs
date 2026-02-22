import fs from "fs";
const path = "src/components/students/StudentAccountBalance.tsx";
const content = fs.readFileSync(path, "utf8");
const fixed = content.replace(
  /[^\n]*startLabel[^\n]*/,
  (m) => (m.includes("const startLabel =") && m.trim().length < 30 ? m : "              const startLabel =")
);
// Simpler: replace any line that has garbage before "const startLabel"
const lines = content.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("const startLabel") && lines[i].includes("від")) {
    lines[i] = "              const startLabel =";
    fs.writeFileSync(path, lines.join("\n"));
    console.log("Fixed line", i + 1);
    process.exit(0);
  }
}
console.log("Not found");
