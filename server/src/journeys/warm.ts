import { journeyCompiler } from "./compile.ts";

const started = Date.now();
try {
  const result = await journeyCompiler.compile();
  process.stdout.write(JSON.stringify({ goalId: result.journey.goalId, cacheHit: result.cacheHit,
    elapsedMs: Date.now() - started, compiledAt: result.journey.compiledAt, sourceCount: result.journey.retrieval.length }) + "\n");
} catch (error) {
  process.stderr.write(`Journey cache warm failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  process.exitCode = 1;
}
