# Run Idler

From this folder, install dependencies once:

```powershell
npm install
```

Start the app:

```powershell
npm run dev
```

Open the local URL shown in the terminal, usually `http://localhost:5173`. Stop the app with `Ctrl+C`. Progress saves automatically in the browser.

Generate developer Balance reports with `npm run balance:report`. Read `balance-reports/balance.md` or use `balance-reports/balance.json`. Band deviations print as advisory warnings.

Run all correctness checks with `npm run check`. Run only the tests with `npm test`, or check authored content with `npm run validate:content`.

For browser tests, first run `npx playwright install chromium`, then `npm run test:e2e`.
