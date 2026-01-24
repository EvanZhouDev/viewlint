import type { JSHandle, Page } from "playwright"

import type {
	BrowserScope,
	BrowserViolationReporter,
	LintLocation,
	Unboxed,
	ViolationReport,
} from "../types.js"

type PageViolationReportWire = {
	message: string
	location: LintLocation
	relations?: Array<{
		description: string
		location: LintLocation
	}>
}

type BrowserReportFn = BrowserViolationReporter

export class RuleEvaluator {
	readonly #page: Page
	readonly #logVerbose: (message: string) => void

	#scopeHandle: JSHandle<BrowserScope>
	#isReportBindingInstalled = false
	#activeBufferedViolations: ViolationReport[] | undefined

	constructor(args: {
		page: Page
		scopeHandle: JSHandle<BrowserScope>
		logVerbose: (message: string) => void
	}) {
		this.#page = args.page
		this.#scopeHandle = args.scopeHandle
		this.#logVerbose = args.logVerbose
	}

	setScopeHandle(scopeHandle: JSHandle<BrowserScope>): void {
		this.#scopeHandle = scopeHandle
	}

	setActiveBuffer(bufferedViolations: ViolationReport[] | undefined): void {
		this.#activeBufferedViolations = bufferedViolations
	}

	async #installReportBindingIfNeeded(): Promise<void> {
		if (this.#isReportBindingInstalled) return
		this.#isReportBindingInstalled = true

		this.#logVerbose("install browser report binding")

		await this.#page.exposeBinding(
			"__viewlint_report",
			async (_source: unknown, wire: PageViolationReportWire) => {
				if (!this.#activeBufferedViolations) {
					throw new Error(
						"viewlint internal error: __viewlint_report called with no active rule",
					)
				}

				this.#activeBufferedViolations.push({
					message: wire.message,
					location: wire.location,
					relations: wire.relations,
				})
			},
		)

		await this.#page.addInitScript(() => {
			const w = window

			const installPayloadHelper = () => {
				w.__viewlint_report_payload = (violation) => {
					const toLocation = (el: Element) => {
						if (!w.__viewlint_finder) {
							throw new Error(
								"viewlint finder runtime is missing. Ensure it is injected before resolving element selectors.",
							)
						}

						return {
							element: {
								selector: w.__viewlint_finder(el),
								tagName: el.tagName.toLowerCase(),
								id: el.id,
								classes: Array.from(el.classList),
							},
						}
					}

					const location = toLocation(violation.element)

					const relations = violation.relations?.map((r) => {
						return {
							description: r.description,
							location: toLocation(r.element),
						}
					})

					if (typeof w.__viewlint_report !== "function") {
						throw new Error(
							"viewlint internal error: __viewlint_report binding missing",
						)
					}
					w.__viewlint_report({
						message: violation.message,
						location,
						relations,
					})
				}
			}

			installPayloadHelper()

			w.addEventListener(
				"pageshow",
				() => {
					try {
						installPayloadHelper()
					} catch {
						// ignore
					}
				},
				{ once: false },
			)
		})
	}

	async #prepareReportHandle(): Promise<JSHandle<BrowserReportFn>> {
		await this.#installReportBindingIfNeeded()

		await this.#page.evaluate(() => {
			if (typeof window.__viewlint_report_payload === "function") return

			window.__viewlint_report_payload = (violation) => {
				const toLocation = (el: Element) => {
					if (!window.__viewlint_finder) {
						throw new Error(
							"viewlint finder runtime is missing. Ensure it is injected before resolving element selectors.",
						)
					}
					return {
						element: {
							selector: window.__viewlint_finder(el),
							tagName: el.tagName.toLowerCase(),
							id: el.id,
							classes: Array.from(el.classList),
						},
					}
				}

				const location = toLocation(violation.element)
				const relations = violation.relations?.map((r) => {
					return {
						description: r.description,
						location: toLocation(r.element),
					}
				})

				if (typeof window.__viewlint_report !== "function") {
					throw new Error(
						"viewlint internal error: __viewlint_report binding missing",
					)
				}
				window.__viewlint_report({
					message: violation.message,
					location,
					relations,
				})
			}
		})

		return await this.#page.evaluateHandle((): BrowserReportFn => {
			const payload = window.__viewlint_report_payload
			if (typeof payload !== "function") {
				throw new Error(
					"viewlint internal error: __viewlint_report_payload missing",
				)
			}
			return payload
		})
	}

	async evaluate<R>(
		fn: (payload: {
			report: BrowserReportFn
			scope: BrowserScope
		}) => R | Promise<R>,
	): Promise<R>
	async evaluate<R, Args>(
		fn: (payload: {
			report: BrowserReportFn
			scope: BrowserScope
			args: Unboxed<Args>
		}) => R | Promise<R>,
		args: Args,
	): Promise<R>
	async evaluate<R>(expression: string): Promise<R>
	async evaluate<R, Args>(expression: string, args: Args): Promise<R>
	async evaluate<R, Args>(
		...evaluateArgs:
			| [
					fn: (payload: {
						report: BrowserReportFn
						scope: BrowserScope
					}) => R | Promise<R>,
			  ]
			| [
					fn: (payload: {
						report: BrowserReportFn
						scope: BrowserScope
						args: Unboxed<Args>
					}) => R | Promise<R>,
					args: Args,
			  ]
			| [expression: string]
			| [expression: string, args: Args]
	): Promise<R> {
		if (typeof evaluateArgs[0] === "string") {
			const expression = evaluateArgs[0]
			if (evaluateArgs.length === 1 || typeof evaluateArgs[1] === "undefined") {
				return this.#page.evaluate<R>(expression)
			}
			return this.#page.evaluate<R, Args>(expression, evaluateArgs[1])
		}

		const reportHandle = await this.#prepareReportHandle()
		try {
			if (evaluateArgs.length === 1) {
				type EvaluateNoArgsWire = {
					report: JSHandle<BrowserReportFn>
					scope: JSHandle<BrowserScope>
				}
				const wire: EvaluateNoArgsWire = {
					report: reportHandle,
					scope: this.#scopeHandle,
				}
				return await this.#page.evaluate<R, EvaluateNoArgsWire>(
					evaluateArgs[0],
					wire,
				)
			}

			type EvaluateWithArgsWire<Arg> = {
				report: JSHandle<BrowserReportFn>
				scope: JSHandle<BrowserScope>
				args: Arg
			}

			const wire: EvaluateWithArgsWire<Args> = {
				report: reportHandle,
				scope: this.#scopeHandle,
				args: evaluateArgs[1],
			}
			return await this.#page.evaluate<R, EvaluateWithArgsWire<Args>>(
				evaluateArgs[0],
				wire,
			)
		} finally {
			await reportHandle.dispose()
		}
	}
}
