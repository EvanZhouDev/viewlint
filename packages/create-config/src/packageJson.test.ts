import { describe, expect, it } from "vitest"

import { derivePackageNameFromCwd, renderPackageJson } from "./packageJson.js"

describe("derivePackageNameFromCwd", () => {
	it("derives a lowercase, hyphenated name", () => {
		expect(derivePackageNameFromCwd("/tmp/My Project")).toBe("my-project")
	})
})

describe("renderPackageJson", () => {
	it("renders a minimal private package.json", () => {
		const rendered = renderPackageJson({ cwd: "/tmp/example" })
		expect(rendered.filePath).toBe("/tmp/example/package.json")
		expect(rendered.contents).toContain('"private": true')
		expect(rendered.contents).toContain('"name": "example"')
	})
})
