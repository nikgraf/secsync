const fs = require("fs");
const data = fs.readFileSync("./package.json", { encoding: "utf8", flag: "r" });

// Display the file data
const dataJson = JSON.parse(data);

dataJson.module = "index.mjs";
dataJson.types = "index.d.ts";
dataJson.main = "index.js";
dataJson.browser = "index.mjs";

fs.writeFileSync("./dist/package.json", JSON.stringify(dataJson, null, 2));
