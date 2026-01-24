import type {
	BrowserContextOptions,
	ElementHandle,
	JSHandle,
	Locator,
	Page,
} from "playwright"
import type { z } from "zod"

// Playwright Types (Not exposed directly, so we recreate them here)

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

// View Model

export type NamedMeta = {
	name?: string
}

export type SetupOpts<
	TArgs extends Record<string, unknown> = Record<string, unknown>,
> = {
	meta?: NamedMeta
	/** BrowserContext options (e.g. baseURL, viewport, storageState). */
	context?: BrowserContextOptions

	/** Arbitrary user payload available to Views/Scopes. */
	args?: TArgs
}

export type View<
	TArgs extends Record<string, unknown> = Record<string, unknown>,
> = {
	meta?: NamedMeta
	setup: (opts?: SetupOpts<TArgs>) => Promise<ViewInstance>
}

export type ViewInstance = {
	page: Page
	reset(): Promise<void>
	close(): Promise<void>
}

export type ScopeContext<
	TArgs extends Record<string, unknown> = Record<string, unknown>,
> = {
	page: Page
	opts: SetupOpts<TArgs>
}

export type Scope<
	TArgs extends Record<string, unknown> = Record<string, unknown>,
> = {
	meta?: NamedMeta
	getLocator: (
		ctx: ScopeContext<TArgs>,
	) => Promise<Locator | Locator[]> | Locator | Locator[]
}

export type Target<
	TArgs extends Record<string, unknown> = Record<string, unknown>,
> = {
	view: View<TArgs>
	options?: SetupOpts<TArgs> | SetupOpts<TArgs>[]
	scope?: Scope<TArgs> | Scope<TArgs>[]
}

// Scope Helpers

export type BrowserScope = {
	roots: Element[]
	queryAll(selector: string): Element[]
	query(selector: string): Element | null
}

export type NodeScope = {
	roots: Locator[]
	locator(selector: string): Locator
}

// Severity

export type Severity = SeverityName

export type ReportSeverity = Exclude<Severity, "inherit" | "off">

type SeverityName = "inherit" | "off" | "info" | "warn" | "error"

// Rule Definition Helpers

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

	// Node-side scope references
	scope: NodeScope
	report(violation: ViolationReport): void

	// Allows access to browser-side reporting
	// NOTE:
	// Prefer `context.evaluate` for reporting from within page context.
	// Use `page.evaluate` directly when you don't need access to `report` or `scope`.
	evaluate<R>(
		fn: (payload: {
			report: BrowserViolationReporter
			scope: BrowserScope
		}) => R | Promise<R>,
	): Promise<R>
	evaluate<R, Arg>(
		fn: (payload: {
			report: BrowserViolationReporter
			scope: BrowserScope
			args: Unboxed<Arg>
		}) => R | Promise<R>,
		args: Arg,
	): Promise<R>
	evaluate<R>(expression: string): Promise<R>
	evaluate<R, Arg>(expression: string, args: Arg): Promise<R>
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
	// List of plugins to use
	plugins?: Record<string, Plugin>

	// List of rules to lint with
	rules?: Partial<Rules>

	// Named option layers for Targets.
	options?: Record<string, SetupOpts | SetupOpts[]>

	// Named Views for Targets.
	views?: Record<string, View>

	// Named scopes for Targets.
	scopes?: Record<string, Scope | Scope[]>
}

export type Config<Rules extends RulesConfig = RulesConfig> =
	ConfigObject<Rules>

export type Options = {
	baseConfig?: Config | Config[]
	overrideConfig?: Config | Config[]
	overrideConfigFile?: string
	plugins?: Record<string, Plugin>
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
	url: string
	target?: Target
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
