export const DATA_SEMANTICS_PROMPT =
  'This is a UI smoke test with the complete tiny dataset inline; answer directly without tools or delegation. ' +
  'Inspect this tiny CSV dataset conceptually and summarize its data semantics: ' +
  'columns time_s, temperature_c, humidity_pct with rows (0,20.1,43), (60,20.4,44), (120,20.9,45). ' +
  'Identify units, observed trends, and one caveat. ';

export const DATA_SEMANTICS_EXPECT =
  /columns and units|degrees Celsius|relative humidity|modest upward|measurements spanning/i;

export function uniqueDataSemanticsPrompt(prefix = ''): string {
  return `${prefix}${DATA_SEMANTICS_PROMPT}(test nonce ${Date.now()}-${Math.random().toString(36).slice(2)})`;
}

export const EARTHSCOPE_GNSS_REGION_BLUEPRINT = 'earthscope-gnss-region';

export const EARTHSCOPE_GNSS_REGION_PROMPT =
  "What recent ground-motion is EarthScope's GNSS network showing around Los Angeles? " +
  'Pull a real station time series, plot it, and tell me how much to trust the data. ' +
  'Use NDP/EarthScope GNSS station evidence, stage a concrete CSV resource, profile the displacement and uncertainty columns, ' +
  'produce a PNG artifact from the staged CSV, and explain data freshness, coverage, and provenance limitations.';

export const EARTHSCOPE_GNSS_REGION_EXPECT =
  /EarthScope|GNSS|station|Los Angeles|MTA1|CSV|artifact|provenance|trust/i;
