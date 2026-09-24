import { mkdir, writeFile } from 'node:fs/promises';
import { buildBalanceReport, renderBalanceMarkdown } from '../src/simulation/balance';
import { runDeveloperChecks } from '../src/simulation/developer-checks';

async function main() {
  runDeveloperChecks();
  const report = buildBalanceReport();
  await mkdir('balance-reports', { recursive: true });
  await Promise.all([
    writeFile('balance-reports/balance.json', `${JSON.stringify(report, null, 2)}\n`),
    writeFile('balance-reports/balance.md', renderBalanceMarkdown(report)),
  ]);
  console.log('Balance reports: balance-reports/balance.md and balance-reports/balance.json');
  for (const warning of report.warnings) console.warn(`Advisory: ${warning.checkpoint} ${warning.metric} ${warning.observed.toFixed(2)} outside [${warning.min}, ${warning.max}]`);
  console.log('Developer correctness checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
