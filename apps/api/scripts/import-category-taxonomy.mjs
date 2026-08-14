import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const source = await readFile(resolve(process.cwd(), '../../docs/商品类目体系-v1.md'), 'utf8');
const nodes = [];
let levelOne = null;
let levelTwo = null;
let levelOneCount = 0;
let levelTwoCount = 0;
let levelThreeCount = 0;

for (const rawLine of source.split(/\r?\n/)) {
  if (/^## (?!\d+\.)/.test(rawLine)) {
    levelOne = null;
    levelTwo = null;
    continue;
  }
  const first = rawLine.match(/^## (\d+)\. (.+)$/);
  if (first) {
    levelOneCount += 1;
    levelTwoCount = 0;
    levelThreeCount = 0;
    levelOne = { code: `TAX-V1-${String(levelOneCount).padStart(2, '0')}`, parentCode: null, name: first[2], level: 1, sortOrder: levelOneCount };
    nodes.push(levelOne);
    continue;
  }
  const second = rawLine.match(/^- ([^：:]+)$/);
  if (second && levelOne) {
    levelTwoCount += 1;
    levelThreeCount = 0;
    levelTwo = { code: `${levelOne.code}-${String(levelTwoCount).padStart(2, '0')}`, parentCode: levelOne.code, name: second[1], level: 2, sortOrder: levelTwoCount };
    nodes.push(levelTwo);
    continue;
  }
  const third = rawLine.match(/^  - ([^：:]+)[：:]/);
  if (third && levelTwo) {
    levelThreeCount += 1;
    nodes.push({ code: `${levelTwo.code}-${String(levelThreeCount).padStart(2, '0')}`, parentCode: levelTwo.code, name: third[1], level: 3, sortOrder: levelThreeCount });
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  for (const node of nodes) {
    await client.query(`INSERT INTO categories (code,parent_id,name,level,sort_order,status)
      VALUES ($1,CASE WHEN $2::text IS NULL THEN NULL ELSE (SELECT id FROM categories WHERE code=$2) END,$3,$4,$5,'ACTIVE')
      ON CONFLICT (code) WHERE code IS NOT NULL DO UPDATE SET parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,
      level=EXCLUDED.level,sort_order=EXCLUDED.sort_order,status='ACTIVE',updated_at=NOW()`,
      [node.code, node.parentCode, node.name, node.level, node.sortOrder]);
  }
  await client.query('COMMIT');
  console.log(`Imported ${nodes.length} categories.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
