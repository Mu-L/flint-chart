import type { ChartWarning } from '../../core/types';
import type { InteractionCapability } from '../../core/interaction-spec';
import type { CanvasInteractionDef } from '../interactions';
import type { NavigationAxes } from '../language/events';
import { INTERACTION_PRESETS } from './registry';

/** What admission reads from the compiled chart: the fields the assembler writes to `_interactionSemantics`. */
export interface InteractionAdmissionPlan {
    readonly chartType?: string;
    /** The capabilities the assembler confirmed for this chart and its data. A plan without them is read from the other fields. */
    readonly capabilities?: readonly InteractionCapability[];
    readonly fields: readonly string[];
    readonly selectableMarks: readonly string[];
    readonly resolve?: unknown;
    readonly navigationAxes?: readonly ('x' | 'y')[];
    readonly supportedRegionGestures?: readonly ('cartesian' | 'angular')[];
}

export interface InteractionAdmission {
    /** The interactions the chart can honour, in their original order. */
    readonly admitted: readonly CanvasInteractionDef[];
    /** One warning per dropped spec interaction. */
    readonly warnings: readonly ChartWarning[];
}

type Axis = 'x' | 'y';

/** The axes a navigation source asks for, given what the chart offers. */
export function navigationAxesFor(
    axes: NavigationAxes | 'available' | undefined,
    available: readonly Axis[],
): readonly Axis[] {
    if (axes === undefined || axes === 'available') return available;
    return axes === 'xy' ? ['x', 'y'] : [axes];
}

const PAN_DRAG_CONFLICT = 'Pan navigation cannot share an unmodified drag gesture with a region interaction.';
const DROPPED = 'The interaction was dropped.';

const NEEDS: Readonly<Record<InteractionCapability, string>> = {
    'elements': 'marks that resolve to data',
    'region': 'a plot to drag a region on',
    'angular-region': 'a polar chart with an angular region',
    'navigation': 'a navigable continuous axis',
    'reorder': 'a discrete axis whose order can change',
    'legend': 'a discrete legend',
    'discrete-axis': 'a discrete axis with category labels',
    'index': 'an index axis shared by the series',
};

/**
 * A plan the assembler did not annotate is read the way the compile step read it:
 * element semantics, the angular flag, and the navigable axes decide; the other
 * capabilities are taken as present.
 */
function inferredCapabilities(plan: InteractionAdmissionPlan): readonly InteractionCapability[] {
    const list: InteractionCapability[] = ['legend', 'reorder', 'discrete-axis', 'index'];
    if (!!plan.resolve || plan.fields.length > 0 || plan.selectableMarks.length > 0) list.push('elements', 'region');
    if (plan.supportedRegionGestures?.includes('angular')) list.push('angular-region');
    if ((plan.navigationAxes ?? []).length > 0) list.push('navigation');
    return list;
}

/** A custom definition states its needs; a preset carries them through the registry; anything else is read off the event source. */
export function interactionRequirements(interaction: CanvasInteractionDef): readonly InteractionCapability[] {
    if (interaction.requires) return interaction.requires;
    if (interaction.preset) return INTERACTION_PRESETS[interaction.preset].requires;
    const source = interaction.eventSource;
    if (source.type === 'navigation') return ['navigation'];
    if (source.type === 'region') {
        return source.regionGeometry === 'angular' ? ['elements', 'angular-region'] : ['elements', 'region'];
    }
    if (source.type === 'element') return ['elements'];
    return [];
}

/**
 * Decide which interactions a compiled chart can honour.
 *
 * The answer depends on origin. A definition made in code throws, because a
 * developer sees the exception. An entry from `interaction_spec` is dropped and
 * reported as a `ChartWarning`, because an agent reads warnings and the chart
 * should still render. When two entries conflict, the one later in the list yields.
 */
export function admitInteractions(
    plan: InteractionAdmissionPlan,
    interactions: readonly CanvasInteractionDef[],
): InteractionAdmission {
    const warnings: ChartWarning[] = [];
    const reject = (
        interaction: CanvasInteractionDef,
        code: 'unsupported_interaction' | 'conflicting_interactions',
        message: string,
    ): false => {
        if (interaction.origin !== 'spec') throw new Error(message);
        warnings.push({ severity: 'warning', code, message: `${message} ${DROPPED}` });
        return false;
    };
    const capabilities = new Set(plan.capabilities ?? inferredCapabilities(plan));
    const chart = plan.chartType ?? 'this chart';
    const available = plan.navigationAxes ?? [];

    // Every capability the interaction needs must be present on this chart.
    let admitted = interactions.filter((interaction) => {
        const missing = interactionRequirements(interaction).find((capability) => !capabilities.has(capability));
        if (missing) {
            return reject(interaction, 'unsupported_interaction',
                `Interaction "${interaction.id}" requires ${NEEDS[missing]}; ${chart} has none.`);
        }
        const source = interaction.eventSource;
        if (source.type === 'navigation') {
            const requested = navigationAxesFor(source.axes, available);
            const unsupported = requested.filter((axis) => !available.includes(axis));
            if (unsupported.length > 0) {
                return reject(interaction, 'unsupported_interaction',
                    `Interaction "${interaction.id}" requested unsupported navigation axis: ${unsupported.join(', ')}.`);
            }
        }
        return true;
    });

    // A chart navigates through one interaction. A later spec entry yields; in code the first wins.
    let navigation: CanvasInteractionDef | undefined;
    admitted = admitted.filter((interaction) => {
        if (interaction.eventSource.type !== 'navigation') return true;
        if (!navigation) {
            navigation = interaction;
            return true;
        }
        if (interaction.origin !== 'spec') return true;
        warnings.push({
            severity: 'warning',
            code: 'conflicting_interactions',
            message: `Interaction "${interaction.id}" is a second navigation interaction; the chart keeps "${navigation.id}". ${DROPPED}`,
        });
        return false;
    });

    // Pan and an unmodified drag gesture cannot share the plot.
    for (;;) {
        const pan = admitted.find((interaction) =>
            interaction.eventSource.type === 'navigation' && interaction.eventSource.pan);
        const drag = admitted.find((interaction) =>
            interaction.eventSource.type !== 'navigation' && interaction.eventSource.gesture === 'drag');
        if (!pan || !drag) break;
        if (pan.origin !== 'spec' && drag.origin !== 'spec') throw new Error(PAN_DRAG_CONFLICT);
        const later = admitted.indexOf(pan) > admitted.indexOf(drag) ? pan : drag;
        const earlier = later === pan ? drag : pan;
        const victim = later.origin === 'spec' ? later : earlier;
        const kept = victim === pan ? drag : pan;
        warnings.push({
            severity: 'warning',
            code: 'conflicting_interactions',
            message: `Interaction "${victim.id}" conflicts with "${kept.id}": ${PAN_DRAG_CONFLICT.charAt(0).toLowerCase()}${PAN_DRAG_CONFLICT.slice(1)} ${DROPPED}`,
        });
        admitted = admitted.filter((interaction) => interaction !== victim);
    }

    // A double-click cannot both activate a mark and reset another interaction. Code definitions
    // both fire; a spec entry yields, the later one first.
    for (;;) {
        const activate = admitted.find((interaction) => interaction.eventSource.gesture === 'double');
        const reset = admitted.find((interaction) =>
            interaction.eventSource.gesture !== 'double' && interaction.reset?.includes('double-click'));
        if (!activate || !reset) break;
        if (activate.origin !== 'spec' && reset.origin !== 'spec') break;
        const later = admitted.indexOf(activate) > admitted.indexOf(reset) ? activate : reset;
        const earlier = later === activate ? reset : activate;
        const victim = later.origin === 'spec' ? later : earlier;
        const kept = victim === activate ? reset : activate;
        warnings.push({
            severity: 'warning',
            code: 'conflicting_interactions',
            message: `Interaction "${victim.id}" conflicts with "${kept.id}": a double-click cannot both activate a mark and reset another interaction. ${DROPPED}`,
        });
        admitted = admitted.filter((interaction) => interaction !== victim);
    }

    return { admitted, warnings };
}
