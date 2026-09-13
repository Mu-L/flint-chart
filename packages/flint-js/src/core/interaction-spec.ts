// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The declarative interaction contract: what an agent or a person writes in
 * `ChartAssemblyInput.interaction_spec`. Pure data, no DOM, no runtime import.
 *
 * `flint-chart/interactive` turns it into interaction definitions
 * (`resolveInteractionSpec`) and exposes the precise per-type option shapes
 * (`InteractionPresetSpec`). This module only names the presets and the
 * envelope around them, so the core stays free of the interactive runtime.
 */

/** The shipped interaction presets. Each name is also that preset's default id. */
export const INTERACTION_PRESET_TYPES = [
    'click-highlight',
    'axis-highlight',
    'click-group-focus',
    'hover-group-focus',
    'click-annotate',
    'select',
    'lasso-select',
    'brush-x',
    'brush-y',
    'brush-angle',
    'brush-zoom',
    'linked-brush',
    'legend-toggle',
    'context-activate',
    'long-press',
    'double-activate',
    'inspect',
    'inspect-index',
    'navigate',
    'drag-reorder',
] as const;

export type InteractionPresetType = (typeof INTERACTION_PRESET_TYPES)[number];

/** A fact about a chart that at least one interaction preset reads at runtime. */
export const INTERACTION_CAPABILITIES = [
    'elements',
    'cartesian-region',
    'angular-region',
    'navigation',
    'reorder',
    'legend',
    'discrete-axis',
    'index',
] as const;

export type InteractionCapability = (typeof INTERACTION_CAPABILITIES)[number];

/**
 * What a chart type offers to interaction presets, declared on
 * `ChartTemplateDef.interactions`. An absent key means the chart type never
 * offers that capability. The assembler confirms the data-dependent ones
 * against the encodings: a legend needs a bound discrete legend channel,
 * navigation needs a continuous unfaceted axis, reorder needs a discrete axis.
 */
export interface ChartInteractionSupport {
    /** Marks resolve to data elements, so click, hover, annotate, and inspect presets work. */
    elements?: boolean;
    /** Drag regions the plot can resolve marks in. */
    region?: readonly ('cartesian' | 'angular')[];
    /**
     * Continuous positional axes whose domains pan and zoom. `geo` marks a
     * chart that places marks through a projection: pan and zoom then move the
     * projection's extent, and both axes navigate together.
     */
    navigation?: { axes?: readonly ('x' | 'y')[]; geo?: boolean };
    /** Discrete positional axes whose domain order a drag can change. */
    reorder?: { axes?: readonly ('x' | 'y')[]; includeConnectiveMarks?: boolean; markTypes?: readonly string[] };
    /** A discrete legend whose items stand for series or categories. */
    legend?: boolean;
    /** Axis labels stand for categories a pointer can target. */
    discreteAxis?: boolean;
    /** One position on the index axis reads a value from every series. */
    index?: boolean;
}

/**
 * One preset as JSON: the type name, an optional id, and that preset's options
 * under `options`, for example
 * `{ "type": "navigate", "options": { "axes": "x", "pan": false } }`.
 * The options are the ones the matching factory in `flint-chart/interactive`
 * accepts; the precise per-type shape is `InteractionPresetSpec` there.
 * `id` defaults to `type` and lives on the entry, never inside `options`.
 */
export interface InteractionEntry {
    type: InteractionPresetType;
    id?: string;
    options?: Record<string, any>;
}

/** Pointer acquisition that snaps to a nearby mark instead of requiring a direct hit. */
export interface TargetDetailsOptions {
    fields?: readonly string[];
    maxRows?: number;
}

export interface TargetFeedbackOptions {
    indicator?: boolean;
    details?: boolean | TargetDetailsOptions;
}

export interface AssistedTargetingOptions extends TargetFeedbackOptions {
    /** Hard override for eligible preset distances, in renderer pixels. */
    maxDistance?: number;
}

/**
 * How a chart behaves. Sits beside `chart_spec` and `theme_spec` in
 * `ChartAssemblyInput`. Only the Vega-Lite interactive surface reads it; the
 * assemblers and the static backends leave it untouched. Retained state is not
 * part of it; a host applies that through the surface.
 */
export interface InteractionSpec {
    /** One entry per interaction. Its type names the preset that makes it, and its options carry its own `reset` list. */
    interactions: readonly InteractionEntry[];
    /** Presets assist by default; false requires direct hits, maxDistance overrides eligible presets. */
    assistedTargeting?: boolean | AssistedTargetingOptions;
    keyboardTargeting?: boolean;
}
