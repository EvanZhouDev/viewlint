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
	severity: ReportSeverity
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
			severity: ReportSeverity
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
			severity: ReportSeverity
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
	report(violation: ViolationReport): void

	evaluate<R>(
		fn: (payload: { report: BrowserViolationReporter }) => R | Promise<R>,
	): Promise<R>

	// Mirrors Playwright's `page.evaluate<R, Arg>`: `arg` can be serializable data and/or JSHandles.
	// Inside the page context it is unboxed (ElementHandle/JSHandle -> underlying value), like Playwright.
	evaluate<R, Arg>(
		fn: (payload: {
			report: BrowserViolationReporter
			arg: Unboxed<Arg>
		}) => R | Promise<R>,
		arg: Arg,
	): Promise<R>

	// Playwright also accepts a string expression in place of a function.
	// Note: When using a string, the `report` helper is not available; call `page.evaluate` if needed.
	evaluate<R>(expression: string): Promise<R>
	evaluate<R, Arg>(expression: string, arg: Arg): Promise<R>

	// Prefer `context.evaluate` for reporting from within page context.
	// Use `page.evaluate` directly when you don't need access to `report`.
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
	schema?: Schema
	defaultOptions?: InferRuleOptions<Schema>
	docs?: RuleDocs
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
}

export type Config<Rules extends RulesConfig = RulesConfig> =
	ConfigObject<Rules>

export type Options = {
	baseConfig?: Config | Config[]
	overrideConfig?: Config | Config[]
	overrideConfigFile?: string
	plugins?: Record<string, Plugin>
	browser?: {
		headless?: boolean
		viewport?: {
			width: number
			height: number
		}
		waitUntil?: "load" | "domcontentloaded" | "networkidle"
		timeoutMs?: number
		disableAnimations?: boolean
	}
}

export type LintRelation = {
	description: string
	location: LintLocation
}

export type LintMessage = {
	location: LintLocation
	relations: Array<LintRelation>
	severity: ReportSeverity
	message: string
}

export type LintResult = {
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
