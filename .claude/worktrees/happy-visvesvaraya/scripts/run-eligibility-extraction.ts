import { processAllGrants, getEligibilityStatus } from '../server/services/eligibilityExtractor';
import * as fs from 'fs';

const PRIORITY_SOURCES = ['Vinnova', 'Energimyndigheten', 'Tillväxtverket', 'EU Funding'];
const BATCH_SIZE = 3;
const MAX_PER_ITERATION = 50;
const DELAY_BETWEEN_AI_BATCHES_MS = 2000;
const DELAY_BETWEEN_ITERATIONS_MS = 2000;
const PROGRESS_FILE = '/tmp/eligibility_progress.json';
const LOG_FILE = '/tmp/eligibility_batch.log';

function appendLog(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch {}
  return { totalProcessed: 0, totalSuccessful: 0, totalFailed: 0, totalSkipped: 0, iteration: 0 };
}

function saveProgress(progress: any) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  const progress = loadProgress();
  
  appendLog('='.repeat(60));
  appendLog('ELIGIBILITY EXTRACTION BATCH RUNNER');
  appendLog('='.repeat(60));
  appendLog(`Resuming from iteration ${progress.iteration}, total processed: ${progress.totalProcessed}`);

  const statusBefore = await getEligibilityStatus();
  appendLog(`Current: ${statusBefore.grants_with_structured_eligibility} / ${statusBefore.total_grants} have structured eligibility`);
  appendLog(`Open grants needing extraction: ${statusBefore.open_grants - statusBefore.open_with_structured}`);

  const remaining = statusBefore.open_grants - statusBefore.open_with_structured;
  if (remaining === 0) {
    appendLog('All grants already processed!');
    process.exit(0);
  }

  while (true) {
    progress.iteration++;
    appendLog(`\n--- Iteration ${progress.iteration} (total processed: ${progress.totalProcessed}) ---`);

    try {
      const result = await processAllGrants({
        batchSize: BATCH_SIZE,
        delayBetweenBatchesMs: DELAY_BETWEEN_AI_BATCHES_MS,
        onlyOpen: true,
        forceReprocess: false,
        maxGrants: MAX_PER_ITERATION,
        prioritySources: PRIORITY_SOURCES,
      });

      progress.totalProcessed += result.processed;
      progress.totalSuccessful += result.successful;
      progress.totalFailed += result.failed;
      progress.totalSkipped += result.skipped;
      saveProgress(progress);

      appendLog(`Iteration ${progress.iteration}: processed=${result.processed}, successful=${result.successful}, failed=${result.failed}, skipped=${result.skipped}`);
      appendLog(`Running totals: processed=${progress.totalProcessed}, successful=${progress.totalSuccessful}, failed=${progress.totalFailed}, skipped=${progress.totalSkipped}`);

      if (result.processed === 0 || result.processed < MAX_PER_ITERATION) {
        appendLog('\n' + '='.repeat(60));
        appendLog('ALL GRANTS PROCESSED');
        break;
      }
    } catch (err: any) {
      appendLog(`ERROR in iteration ${progress.iteration}: ${err.message}`);
      saveProgress(progress);
      if (err.message?.includes('rate') || err.message?.includes('429')) {
        appendLog('Rate limited - waiting 30s...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }
      break;
    }

    appendLog(`Waiting ${DELAY_BETWEEN_ITERATIONS_MS}ms before next iteration...`);
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ITERATIONS_MS));
  }

  const statusAfter = await getEligibilityStatus();
  appendLog('\n' + '='.repeat(60));
  appendLog('FINAL RESULTS');
  appendLog('='.repeat(60));
  appendLog(`Total processed: ${progress.totalProcessed}`);
  appendLog(`Successful: ${progress.totalSuccessful}`);
  appendLog(`Failed: ${progress.totalFailed}`);
  appendLog(`Skipped: ${progress.totalSkipped}`);
  appendLog(`Structured eligibility coverage: ${statusAfter.grants_with_structured_eligibility} / ${statusAfter.total_grants} (${statusAfter.structured_coverage_pct}%)`);

  process.exit(0);
}

main().catch(err => {
  appendLog(`Fatal error: ${err.message}`);
  process.exit(1);
});
