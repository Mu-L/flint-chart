import type { InteractionDismissPolicy } from '../core/interaction-spec';
import { isCanvasInteraction, type InteractionDef } from './interactions';
import type { InteractionResetGesture } from './reset';

/**
 * The list the deprecated global `dismiss` policy stands for. `undefined` means the
 * policy was not set, so every interaction keeps its own list.
 */
export function resetGesturesFromDismiss(
    dismiss: InteractionDismissPolicy | false | undefined,
): readonly InteractionResetGesture[] | undefined {
    if (dismiss === undefined) return undefined;
    if (dismiss === false) return [];
    const gestures: InteractionResetGesture[] = [];
    // `any`, `non-element`, and `plot-background` all read as a click that hit nothing.
    if (dismiss.click !== false) gestures.push('click-none');
    if (dismiss.escape ?? true) gestures.push('escape');
    return gestures;
}

/**
 * `options.dismiss` once governed every selection and annotation on a chart. While it
 * survives as a deprecated option, it maps onto every interaction that resets by default.
 * Settings that reset only when asked (an empty list) and viewports keep their own lists,
 * because the old policy never touched them.
 */
export function applyDismissDefaults(
    interactions: readonly InteractionDef[],
    dismiss: InteractionDismissPolicy | false | undefined,
): readonly InteractionDef[] {
    const gestures = resetGesturesFromDismiss(dismiss);
    if (!gestures) return interactions;
    return interactions.map((interaction) => {
        if (!isCanvasInteraction(interaction)) return interaction;
        const { reset, eventSource } = interaction;
        if (!reset || reset.length === 0 || eventSource.type === 'navigation' || eventSource.viewport) return interaction;
        return { ...interaction, reset: gestures };
    });
}
