const fs = require('fs');
const path = 'c:/Zynk(Desktop)/server/routes/groups.js';
let src = fs.readFileSync(path, 'utf8');

src = src.replace(/const (\w+) = db\.transaction\(\(\) => \{([\s\S]*?)\}\);\s*\1\(\);/g, (match, p1, p2) => {
  return `db.exec('BEGIN');\ntry {${p2}\ndb.exec('COMMIT');\n} catch (err) {\ndb.exec('ROLLBACK');\nthrow err;\n}`;
});

fs.writeFileSync(path, src);
