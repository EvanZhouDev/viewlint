import { describe, expect, it } from "bun:test"

import { getRequiredDependencies } from "./promptForSetupPlan.js"

describe("getRequiredDependencies", () => {
	it("returns viewlint and @viewlint/rules", () => {
		expect(getRequiredDependencies()).toEqual(["viewlint", "@viewlint/rules"])
	})
})
