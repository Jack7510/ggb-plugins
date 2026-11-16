/** @fileoverview CLI: render a delivery's verification report as printable HTML. */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { writeReport } from '../dist/src/report.js';

const { values } = parseArgs({
  options: {
    delivery: { type: 'string' },
    output: { type: 'string' },
  },
});
if (values.delivery === undefined || values.output === undefined) {
  console.error('Usage: node scripts/render-report.mjs --delivery <dir> --output <file.html>');
  process.exitCode = 2;
} else {
  const result = await writeReport(resolve(values.delivery), resolve(values.output));
  console.log(JSON.stringify(result));
}
