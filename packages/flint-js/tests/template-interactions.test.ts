import { describe, expect, it } from 'vitest';
import { vlAllTemplateDefs } from '../src/vegalite/templates';

const POLAR = ['Pie Chart', 'Donut Chart', 'Rose Chart', 'Radar Chart'];

describe('Vega-Lite templates declare their interaction support', () => {
    it('every template carries an interactions block', () => {
        const missing = vlAllTemplateDefs.filter((def) => !def.interactions).map((def) => def.chart);
        expect(missing).toEqual([]);
    });

    it('every template resolves marks to data elements', () => {
        const without = vlAllTemplateDefs.filter((def) => !def.interactions?.elements).map((def) => def.chart);
        expect(without).toEqual([]);
    });

    it('polar templates offer the angular region and nothing cartesian', () => {
        for (const def of vlAllTemplateDefs) {
            const region = def.interactions?.region ?? [];
            if (POLAR.includes(def.chart)) {
                expect(region, def.chart).toEqual(['angular']);
                expect(def.interactions?.navigation, def.chart).toBeUndefined();
                expect(def.interactions?.reorder, def.chart).toBeUndefined();
            } else {
                expect(region, def.chart).not.toContain('angular');
            }
        }
    });

    it('projected charts navigate through geo and never through a reorder axis', () => {
        for (const chart of ['Map', 'Choropleth']) {
            const def = vlAllTemplateDefs.find((candidate) => candidate.chart === chart)!;
            expect(def.interactions?.navigation).toEqual({ geo: true });
            expect(def.interactions?.reorder).toBeUndefined();
        }
    });

    it('the donut inherits the pie declaration', () => {
        const pie = vlAllTemplateDefs.find((def) => def.chart === 'Pie Chart')!;
        const donut = vlAllTemplateDefs.find((def) => def.chart === 'Donut Chart')!;
        expect(donut.interactions).toBe(pie.interactions);
    });
});
