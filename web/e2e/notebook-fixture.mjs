// Jupyter notebooks for the file viewer: one with every cell and output kind, one
// cut off mid-file and one with no cells.
import { crc32, deflateSync } from 'node:zlib';

export const NOTEBOOK_PATH = 'analysis/opal-gnss.ipynb';
export const BROKEN_NOTEBOOK_PATH = 'analysis/draft-cut-off.ipynb';
export const EMPTY_NOTEBOOK_PATH = 'analysis/untitled.ipynb';

/** A minimal RGB PNG encoder: enough for a plotted figure. */
function png(width, height, paint) {
  const pixels = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y += 1) pixels[y * (width * 3 + 1)] = 0;
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = y * (width * 3 + 1) + 1 + x * 3;
    pixels[at] = r;
    pixels[at + 1] = g;
    pixels[at + 2] = b;
  };
  paint(set);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Daily vertical displacement at two stations, drawn as a matplotlib-style figure. */
function displacementFigure() {
  const width = 560;
  const height = 260;
  const left = 48;
  const right = width - 16;
  const top = 16;
  const bottom = height - 32;
  return png(width, height, (set) => {
    const line = (x0, y0, x1, y1, colour, weight = 1) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let step = 0; step <= steps; step += 1) {
        const x = Math.round(x0 + ((x1 - x0) * step) / steps);
        const y = Math.round(y0 + ((y1 - y0) * step) / steps);
        for (let dx = 0; dx < weight; dx += 1)
          for (let dy = 0; dy < weight; dy += 1) set(x + dx, y + dy, colour);
      }
    };
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = top + ((bottom - top) * tick) / 4;
      line(left, y, right, y, [232, 232, 232]);
    }
    for (let tick = 0; tick <= 6; tick += 1) {
      const x = left + ((right - left) * tick) / 6;
      line(x, top, x, bottom, [240, 240, 240]);
      line(x, bottom, x, bottom + 4, [60, 60, 60]);
    }
    line(left, top, left, bottom, [60, 60, 60]);
    line(left, bottom, right, bottom, [60, 60, 60]);
    const series = (phase, scale, offset, colour) => {
      let previous;
      for (let day = 0; day <= 365; day += 1) {
        const value =
          Math.sin((day / 365) * Math.PI * 2 + phase) * scale +
          Math.sin(day * 0.37 + phase * 3) * 0.6 -
          (day > 200 && day < 260 ? (1 - Math.abs(day - 230) / 30) * 3.2 : 0) +
          offset;
        const x = left + ((right - left) * day) / 365;
        const y = top + ((bottom - top) * (6 - value)) / 12;
        if (previous) line(previous[0], previous[1], x, y, colour, 2);
        previous = [x, y];
      }
    };
    series(0, 3.5, 0.5, [31, 119, 180]);
    series(0.6, 2.4, -1.2, [255, 127, 14]);
  }).toString('base64');
}

const lines = (text) =>
  text.split('\n').map((line, index, all) => (index < all.length - 1 ? `${line}\n` : line));

const DATAFRAME_HTML = `<div>
<style scoped>
    .dataframe tbody tr th:only-of-type { vertical-align: middle; }
</style>
<table border="1" class="dataframe">
  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>station</th>
      <th>days</th>
      <th>mean_mm</th>
      <th>std_mm</th>
      <th>gaps</th>
    </tr>
  </thead>
  <tbody>
    <tr><th>0</th><td>P395</td><td>365</td><td>0.48</td><td>2.61</td><td>0</td></tr>
    <tr><th>1</th><td>P396</td><td>361</td><td>-1.17</td><td>1.84</td><td>4</td></tr>
    <tr><th>2</th><td>P403</td><td>342</td><td>0.92</td><td>3.05</td><td>23</td></tr>
    <tr><th>3</th><td>P407</td><td>365</td><td>-0.31</td><td>2.12</td><td>0</td></tr>
  </tbody>
</table>
<p>4 rows × 5 columns</p>
<script>console.log('dropped by the reader')</script>
<img src="x" onerror="alert('dropped by the reader')">
</div>`;

const TRACEBACK = [
  '\u001b[0;31m---------------------------------------------------------------------------\u001b[0m',
  '\u001b[0;31mKeyError\u001b[0m                                  Traceback (most recent call last)',
  "Cell \u001b[0;32mIn[6], line 2\u001b[0m\n\u001b[1;32m      1\u001b[0m station \u001b[38;5;241m=\u001b[39m \u001b[38;5;124m'P999'\u001b[39m\n\u001b[0;32m----> 2\u001b[0m series \u001b[38;5;241m=\u001b[39m daily\u001b[38;5;241m.\u001b[39mloc[station]",
  'File \u001b[0;32m~/opal/.venv/lib/python3.12/site-packages/pandas/core/indexing.py:1191\u001b[0m, in \u001b[0;36m_LocationIndexer.__getitem__\u001b[0;34m(self, key)\u001b[0m\n\u001b[1;32m   1189\u001b[0m maybe_callable \u001b[38;5;241m=\u001b[39m com\u001b[38;5;241m.\u001b[39mapply_if_callable(key, \u001b[38;5;28mself\u001b[39m\u001b[38;5;241m.\u001b[39mobj)\n\u001b[0;32m-> 1191\u001b[0m \u001b[38;5;28;01mreturn\u001b[39;00m \u001b[38;5;28mself\u001b[39m\u001b[38;5;241m.\u001b[39m_getitem_axis(maybe_callable, axis\u001b[38;5;241m=\u001b[39maxis)',
  "\u001b[0;31mKeyError\u001b[0m: 'P999'",
];

export function notebookFixture() {
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3 (ipykernel)', language: 'python' },
      language_info: { name: 'python', version: '3.12.4', file_extension: '.py' },
    },
    cells: [
      {
        cell_type: 'markdown',
        id: 'intro',
        metadata: {},
        source: lines(
          '# Opal GNSS vertical displacement\n\nDaily solutions for four **Plate Boundary Observatory** stations, 2022. The dip between days 200 and 260 is the drought signal discussed in the paper.\n\n- Source: `results/stations.csv`\n- Units: millimetres, relative to the 2021 mean',
        ),
      },
      {
        cell_type: 'code',
        id: 'load',
        execution_count: 1,
        metadata: {},
        source: lines(
          'import pandas as pd\nimport matplotlib.pyplot as plt\n\ndaily = pd.read_csv("results/stations.csv", parse_dates=["day"]).set_index("station")\nprint(f"{len(daily):,} daily solutions from {daily.index.nunique()} stations")',
        ),
        outputs: [
          {
            output_type: 'stream',
            name: 'stdout',
            text: ['1,433 daily solutions ', 'from 4 stations\n'],
          },
          {
            output_type: 'stream',
            name: 'stderr',
            text: [
              '/home/jc/opal/.venv/lib/python3.12/site-packages/pandas/io/parsers.py:1704: DtypeWarning: Columns (7) have mixed types. Specify dtype option on import or set low_memory=False.\n',
            ],
          },
        ],
      },
      {
        cell_type: 'code',
        id: 'summary',
        execution_count: 2,
        metadata: {},
        source: lines(
          'summary = daily.groupby("station").agg(days=("day", "nunique"), mean_mm=("up", "mean"), std_mm=("up", "std"), gaps=("gap", "sum"))\nsummary.reset_index()',
        ),
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 2,
            metadata: {},
            data: {
              'text/plain': lines(
                '  station  days  mean_mm  std_mm  gaps\n0    P395   365     0.48    2.61     0\n1    P396   361    -1.17    1.84     4\n2    P403   342     0.92    3.05    23\n3    P407   365    -0.31    2.12     0',
              ),
              'text/html': lines(DATAFRAME_HTML),
            },
          },
        ],
      },
      {
        cell_type: 'markdown',
        id: 'figure-note',
        metadata: {},
        source: lines(
          '## Seasonal cycle\n\nP395 and P396 share the annual cycle; the summer dip is sharper at P395.',
        ),
      },
      {
        cell_type: 'code',
        id: 'plot',
        execution_count: 5,
        metadata: {},
        source: lines(
          'fig, ax = plt.subplots(figsize=(7, 3.25))\nfor station in ["P395", "P396"]:\n    ax.plot(daily.loc[station, "day"], daily.loc[station, "up"], label=station)\nax.set_ylabel("Vertical (mm)")\nax.legend()\nplt.show()',
        ),
        outputs: [
          {
            output_type: 'display_data',
            metadata: {},
            data: {
              'image/png': displacementFigure(),
              'text/plain': ['<Figure size 700x325 with 1 Axes>'],
            },
          },
        ],
      },
      {
        cell_type: 'code',
        id: 'missing',
        execution_count: 6,
        metadata: {},
        source: lines("station = 'P999'\nseries = daily.loc[station]"),
        outputs: [
          { output_type: 'error', ename: 'KeyError', evalue: "'P999'", traceback: TRACEBACK },
        ],
      },
      {
        cell_type: 'code',
        id: 'export',
        execution_count: null,
        metadata: {},
        source: lines('summary.to_parquet("results/summary.parquet")'),
        outputs: [],
      },
    ],
  };
  const text = JSON.stringify(notebook, null, 1);
  return {
    notebook: Buffer.from(text, 'utf8'),
    broken: Buffer.from(text.slice(0, Math.floor(text.length * 0.4)), 'utf8'),
    empty: Buffer.from(
      JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [] }, null, 1),
      'utf8',
    ),
  };
}
