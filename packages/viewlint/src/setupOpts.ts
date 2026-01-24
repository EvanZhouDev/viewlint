import { deepMerge } from "./helpers.js"
import type { SetupOpts } from "./types.js"

export type SetupOptsInput<TArgs extends Record<string, unknown>> =
	| SetupOpts<TArgs>
	| SetupOpts<TArgs>[]
	| undefined

export const toSetupOptsLayers = <TArgs extends Record<string, unknown>>(
	value: SetupOptsInput<TArgs>,
): SetupOpts<TArgs>[] => {
	if (!value) return []
	return Array.isArray(value) ? value : [value]
}

export const concatSetupOptsLayers = <TArgs extends Record<string, unknown>>(
	...layers: Array<SetupOptsInput<TArgs>>
): SetupOpts<TArgs>[] => {
	return layers.flatMap(toSetupOptsLayers)
}

export const mergeSetupOptsLayers = <TArgs extends Record<string, unknown>>(
	layers: readonly SetupOpts<TArgs>[],
): SetupOpts<TArgs> => {
	let merged: SetupOpts<TArgs> = {}

	for (const layer of layers) {
		merged = deepMerge(merged, layer)
	}

	return merged
}

export const mergeSetupOpts = <TArgs extends Record<string, unknown>>(
	value: SetupOptsInput<TArgs>,
): SetupOpts<TArgs> => {
	return mergeSetupOptsLayers(toSetupOptsLayers(value))
}
