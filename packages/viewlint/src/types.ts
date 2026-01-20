import type { ElementHandle, JSHandle, Locator, Page } from "playwright"
import type { z } from "zod"

// Playwright's `Unboxed<T>` is not publicly exported via package exports.
// We mirror it here so `context.evaluate` can type args like Playwright `page.evaluate<R, Arg>`.

type NoHandles<Arg> = Arg extends JSHandle
	? never
	: Arg extends object
		? { [Key in keyof Arg]: NoHandles<Arg[Key]> }
		: Arg

export type Unboxed<Arg> =
	Arg extends ElementHandle<infer T>
		? T
		: Arg extends JSHandle<infer T>
			? T
			: Arg extends NoHandles<Arg>
				? Arg
				: Arg extends [infer A0]
					? [Unboxed<A0>]
					: Arg extends [infer A0, infer A1]
						? [Unboxed<A0>, Unboxed<A1>]
						: Arg extends [infer A0, infer A1, infer A2]
							? [Unboxed<A0>, Unboxed<A1>, Unboxed<A2>]
							: Arg extends [infer A0, infer A1, infer A2, infer A3]
								? [Unboxed<A0>, Unboxed<A1>, Unboxed<A2>, Unboxed<A3>]
								: Arg extends Array<infer T>
									? Array<Unboxed<T>>
									: Arg extends object
										? { [Key in keyof Arg]: Unboxed<Arg[Key]> }
										: Arg

// ============================================================================
// Browser Options
// ============================================================================

/**
 * Browser environment configuration.
 * Used globally in config and can be overridden per-scene.
 */
export type BrowserOptions = {
	headless?: boolean
	viewport?: { width: number; height: number }
	waitUntil?: "load" | "domcontentloaded" | "networkidle"
	timeoutMs?: number
	disableAnimations?: boolean
}

// ============================================================================
// Scenes
// ============================================================================

/**
 * Context provided to scene actions.
 */
export type SceneActionContext = {
	page: Page
	url: string
	targetId: string
	sceneName: string
}

/**
 * A scene action is a Playwright-driven step that mutates UI state.
 */
export type SceneAction = (ctx: SceneActionContext) => Promise<void> | void

/**
 * Context provided to root factory functions.
 */
export type RootsContext = {
	page: Page
	url: string
	targetId: string
	sceneName: string
}

/**
 * A root factory returns one or more Playwright Locators that define scoped regions.
 */
export type RootFactory = (ctx: RootsContext) => Locator | Locator[]

/**
 * A scene describes how to reach a lintable page state.
 */
export type Scene = {
	/** The URL to navigate to. */
	url: string

	/** Optional per-scene browser environment overrides. */
	browser?: BrowserOptions

	/** Actions run after initial navigation to set up the desired state. */
	actions?: SceneAction[]

	/** Root factories that define scoped regions for partial linting. */
	roots?: RootFactory[]
}

// ============================================================================
// Scope (Rule Author APIs)
// ============================================================================

/**
 * Browser-side scope available in context.evaluate callbacks.
 * Provides DOM-oriented helpers for scoped querying.
 */
export type BrowserScope = {
	/** The resolved root elements. */
	roots: HTMLElement[]

	/** Query within all roots, merge and dedupe results. */
	queryAll(selector: string): HTMLElement[]

	/** Equivalent to the first match among all roots. */
	query(selector: string): HTMLElement | null
}

/**
 * Node-side scope available on RuleContext.
 * Provides Playwright Locator-oriented helpers.
 */
export type NodeScope = {
	/** The resolved root locators. */
	roots: Locator[]

	/** Returns a locator matching `selector` within the scoped roots. */
	locator(selector: string): Locator
}

// ============================================================================
// Targets
// ============================================================================

/**
 * A target is what ViewLint lints: either a URL or a named scene.
 */
export type Target =
	| { kind: "url"; id: string; url: string }
	| { kind: "scene"; id: string; sceneName: string }

// ============================================================================
// Severity
// ============================================================================

export type Severity = SeverityName

export type ReportSeverity = Exclude<Severity, "inherit" | "off">

type SeverityName = "inherit" | "off" | "info" | "warn" | "error"

export type ElementDescriptor = {
	selector: string
	tagName: string
	id: string
	classes: string[]
}

export type LintLocation = {
	element: ElementDescriptor
}

export type PageViolationReport = {
	message: string
	element: HTMLElement
	relations?: Array<{
		description: string
		element: HTMLElement
	}>
}

export type BrowserViolationReporter = (violation: PageViolationReport) => void

export type ViolationReport =
	| {
			message: string
			element: Locator
			relations?:
				| {
						description: string
						element: Locator
				  }[]
				| {
						description: string
						location: LintLocation
				  }[]
	  }
	| {
			message: string
			location: LintLocation
			relations?:
				| {
						description: string
						element: Locator
				  }[]
				| {
						description: string
						location: LintLocation
				  }[]
	  }

export type RuleContext<RuleOptions> = {
	url: string
	page: Page
	options: RuleOptions

	/**
	 * Node-side scope for Playwright-based scoped operations.
	 * Use this for Playwright actions within scope.
	 */
	scope: NodeScope

	report(violation: ViolationReport): void

	/**
	 * Evaluate a function in browser context with report and scope helpers injected.
	 */
	evaluate<R>(
		fn: (payload: {
			report: BrowserViolationReporter
			scope: BrowserScope
		}) => R | Promise<R>,
	): Promise<R>

	// Mirrors Playwright's `page.evaluate<R, Arg>`: `arg` can be serializable data and/or JSHandles.
	// Inside the page context it is unboxed (ElementHandle/JSHandle -> underlying value), like Playwright.
	evaluate<R, Arg>(
		fn: (payload: {
			report: BrowserViolationReporter
			scope: BrowserScope
			arg: Unboxed<Arg>
		}) => R | Promise<R>,
		arg: Arg,
	): Promise<R>

	// Playwright also accepts a string expression in place of a function.
	// Note: When using a string, the `report` and `scope` helpers are not available; call `page.evaluate` if needed.
	evaluate<R>(expression: string): Promise<R>
	evaluate<R, Arg>(expression: string, arg: Arg): Promise<R>

	// Prefer `context.evaluate` for reporting from within page context.
	// Use `page.evaluate` directly when you don't need access to `report` or `scope`.
}

export type RuleDocs = {
	description?: string
	recommended?: boolean
}

export type RuleSchema = z.ZodTypeAny | ReadonlyArray<z.ZodTypeAny>

type InferRuleOptions<Schema> =
	Schema extends ReadonlyArray<z.ZodTypeAny>
		? {
				[K in keyof Schema]: Schema[K] extends z.ZodTypeAny
					? z.infer<Schema[K]>
					: never
			}
		: Schema extends z.ZodTypeAny
			? [z.infer<Schema>]
			: []

export type RuleMeta<
	Schema extends RuleSchema | undefined = RuleSchema | undefined,
> = {
	severity?: ReportSeverity
	schema?: Schema
	defaultOptions?: InferRuleOptions<Schema>
	docs?: RuleDocs

	/**
	 * If true, the rule is assumed to mutate page state (scroll, click, DOM edits, etc)
	 * and must run in an isolated page instance.
	 */
	hasSideEffects?: boolean
}

export type RuleDefinition<
	Schema extends RuleSchema | undefined = RuleSchema | undefined,
> = {
	meta?: RuleMeta<Schema>
	run(context: RuleContext<InferRuleOptions<Schema>>): Promise<void> | void
}

export type Plugin = {
	meta?: {
		name?: string
		version?: string
		namespace?: string
	}
	rules?: Record<string, RuleDefinition<RuleSchema | undefined>>
	configs?: Record<string, ConfigObject>
}

export type RuleConfig<RuleOptions extends unknown[] = unknown[]> =
	| Severity
	| [Severity, ...Partial<RuleOptions>]

export type RulesConfig = {
	[key: string]: RuleConfig
}

export type ConfigObject<Rules extends RulesConfig = RulesConfig> = {
	plugins?: Record<string, Plugin>
	rules?: Partial<Rules>

	/** Global browser environment defaults for all targets. */
	browser?: BrowserOptions

	/** Named scenes for reaching specific page states. */
	scenes?: Record<string, Scene>
}

export type Config<Rules extends RulesConfig = RulesConfig> =
	ConfigObject<Rules>

export type Options = {
	baseConfig?: Config | Config[]
	overrideConfig?: Config | Config[]
	overrideConfigFile?: string
	plugins?: Record<string, Plugin>

	debug?: {
		verbose?: boolean
	}
}

export type LintRelation = {
	description: string
	location: LintLocation
}

export type LintMessage = {
	ruleId: string
	location: LintLocation
	relations: Array<LintRelation>
	severity: ReportSeverity
	message: string
}

export type LintResult = {
	/** Stable target identity (scene name or URL). */
	targetId: string

	/** The final URL navigated to. */
	url: string

	messages: LintMessage[]
	suppressedMessages: LintMessage[]

	errorCount: number
	infoCount: number
	warningCount: number
	recommendCount: number
}

export type LoadedFormatter = {
	format(results: LintResult[]): string | Promise<string>
}
