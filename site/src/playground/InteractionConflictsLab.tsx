import { useMemo } from 'react';
import type { ChartAssemblyInput, InteractionEntry } from 'flint-chart';
import { InteractiveVegaLiteView } from '../components/InteractiveVegaLiteView';
import './interaction-conflicts.css';

const BARS = [
  { country: 'Viet Nam', region: 'East Asia and the Pacific', reading: 83.2 },
  { country: 'Belarus', region: 'Europe and Central Asia', reading: 82.4 },
  { country: 'Tunisia', region: 'Middle East and North Africa', reading: 66.0 },
  { country: 'Mongolia', region: 'East Asia and the Pacific', reading: 63.2 },
  { country: 'Kyrgyzstan', region: 'Europe and Central Asia', reading: 57.8 },
  { country: 'Bangladesh', region: 'South Asia', reading: 48.8 },
  { country: 'Zimbabwe', region: 'Sub-Saharan Africa', reading: 44.4 },
  { country: 'Nepal', region: 'South Asia', reading: 39.2 },
  { country: 'Ghana', region: 'Sub-Saharan Africa', reading: 21.4 },
  { country: 'Chad', region: 'Sub-Saharan Africa', reading: 4.4 },
];

const POINTS = Array.from({ length: 24 }, (_, index) => ({
  x: Math.round(((index * 37) % 100) * 10) / 10,
  y: Math.round(((index * 53 + 17) % 100) * 10) / 10,
  group: ['North', 'South', 'East'][index % 3],
}));

function bar(interactions: readonly InteractionEntry[], colour = true): ChartAssemblyInput {
  return {
    data: { values: BARS },
    semantic_types: {
      country: 'Country',
      region: 'Region',
      reading: { semanticType: 'Percentage', intrinsicDomain: [0, 100] },
    },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: {
        y: { field: 'country', sortBy: 'x', sortOrder: 'descending' },
        x: { field: 'reading' },
        ...(colour ? { color: { field: 'region' } } : {}),
      },
      baseSize: { width: 380, height: 260 },
    },
    interaction_spec: { interactions },
  } as ChartAssemblyInput;
}

function scatter(interactions: readonly InteractionEntry[]): ChartAssemblyInput {
  return {
    data: { values: POINTS },
    semantic_types: { x: 'Number', y: 'Number', group: 'Category' },
    chart_spec: {
      chartType: 'Scatter Plot',
      encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'group' } },
      baseSize: { width: 380, height: 260 },
    },
    interaction_spec: { interactions },
  } as ChartAssemblyInput;
}

interface ConflictCase {
  id: string;
  title: string;
  /** What the two entries share, and who owns it. */
  story: string;
  /** What the reader should see when they try it. */
  expect: string;
  input: ChartAssemblyInput;
}

const CASES: readonly ConflictCase[] = [
  {
    id: 'legend-click',
    title: 'Legend click: click-highlight and legend-toggle',
    story: 'Both answer a click on a legend item. click-highlight can give the legend up and keep marks and axis labels, so it does.',
    expect: 'Click a legend item. The series hides and nothing dims. Click a bar. It still emphasises.',
    input: bar([{ type: 'click-highlight' }, { type: 'legend-toggle' }]),
  },
  {
    id: 'axis-click',
    title: 'Axis label click: click-highlight and axis-highlight',
    story: 'Both answer a click on an axis label. click-highlight yields the axis and keeps marks and the legend.',
    expect: 'Click a country label. One emphasis, from axis-highlight. Then click a bar: the label emphasis is replaced, not stacked.',
    input: bar([{ type: 'click-highlight' }, { type: 'axis-highlight' }]),
  },
  {
    id: 'focus-mark',
    title: 'Mark click with retained focus: click-highlight and click-group-focus',
    story: 'Both keep an emphasis in the focus group and both answer a mark click. click-highlight yields the mark and keeps the legend and the axis.',
    expect: 'Click a bar. Its whole region emphasises once. Click a legend item. click-highlight still emphasises the series.',
    input: bar([{ type: 'click-highlight' }, { type: 'click-group-focus', options: { groupBy: 'region' } }]),
  },
  {
    id: 'composes',
    title: 'A pair that composes: click-highlight and click-annotate',
    story: 'Both answer a mark click, but click-annotate keeps no focus state, so nothing is shared. No warning.',
    expect: 'Click a bar. It emphasises and gets an annotation. Click empty plot: both clear.',
    input: bar([{ type: 'click-highlight' }, { type: 'click-annotate' }]),
  },
  {
    id: 'targets-option',
    title: 'Author control: targets on click-highlight',
    story: 'click-highlight limited to marks never asks for the legend, so there is nothing to resolve. No warning.',
    expect: 'Same behaviour as the first case, with no info line under the chart.',
    input: bar([{ type: 'click-highlight', options: { targets: ['mark'] } }, { type: 'legend-toggle' }]),
  },
  {
    id: 'owner-dropped',
    title: 'Owner dropped by the data: no colour field',
    story: 'legend-toggle needs a legend and this chart has none, so it is dropped before the trigger loop runs. click-highlight keeps its legend affordance.',
    expect: 'One unsupported_interaction warning, no yield.',
    input: bar([{ type: 'click-highlight' }, { type: 'legend-toggle' }], false),
  },
  {
    id: 'region-slot',
    title: 'Region drag slot: brush-x and brush-y',
    story: 'The runtime mounts one region drag. Neither can give it up, so the later entry yields whole.',
    expect: 'Drag on the plot: an x brush. brush-y is dropped with a warning.',
    input: scatter([{ type: 'brush-x' }, { type: 'brush-y' }]),
  },
  {
    id: 'plot-drag',
    title: 'Plot drag: navigate with pan and select',
    story: 'A pan and a rectangle both take the unmodified drag on the plot. The later entry yields whole.',
    expect: 'Drag pans the plot. select is dropped with a warning.',
    input: scatter([{ type: 'navigate' }, { type: 'select' }]),
  },
  {
    id: 'double-click',
    title: 'Double-click: navigate reset and double-activate',
    story: 'navigate resets on double-click by default, and double-activate activates on it. Reset lists never yield partially, so the later entry yields whole.',
    expect: 'Double-click returns the viewport home. double-activate is dropped with a warning.',
    input: scatter([{ type: 'navigate' }, { type: 'double-activate' }]),
  },
  {
    id: 'reset-option',
    title: 'Author control: reset on navigate',
    story: 'navigate with reset: ["escape"] does not ask for the double-click, so both entries stay. No warning.',
    expect: 'Double-click emphasises a point. Escape returns the viewport home.',
    input: scatter([{ type: 'navigate', options: { reset: ['escape'] } }, { type: 'double-activate' }]),
  },
];

function specText(input: ChartAssemblyInput): string {
  return JSON.stringify(input.interaction_spec, null, 2);
}

export function InteractionConflictsLab() {
  const cases = useMemo(() => CASES, []);
  return (
    <div className="dev-page icf-page">
      <header className="dev-page-heading">
        <h1>Conflict cases</h1>
        <p>
          Two interactions that share a trigger, one gesture on one kind of hit, and how admission resolves them.
          The line under each chart is the warning the surface reports, the same one <code>validateChart</code> and
          the MCP <code>validate_chart</code> return. An <strong>info</strong> line means one entry gave up the shared
          trigger and kept the rest. A <strong>warning</strong> line means the later entry was dropped.
        </p>
      </header>
      <div className="icf-cases">
        {cases.map((item) => (
          <section key={item.id} className="icf-case" aria-labelledby={`icf-${item.id}`}>
            <h2 id={`icf-${item.id}`}>{item.title}</h2>
            <p className="icf-story">{item.story}</p>
            <div className="icf-body">
              <div className="icf-chart">
                <InteractiveVegaLiteView input={item.input} chartId={`icf-${item.id}`} ariaLabel={item.title} />
              </div>
              <div className="icf-aside">
                <pre className="icf-spec">{specText(item.input)}</pre>
                <p className="icf-expect"><strong>Try it.</strong> {item.expect}</p>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
