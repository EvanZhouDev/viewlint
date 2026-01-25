import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadViewlintConfigFromFile } from "../src/loadConfigFile.js"

describe("loadViewlintConfigFromFile", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "viewlint-loadconfig-test-")),
		)
	})

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true })
		vi.restoreAllMocks()
	})

	function writeConfig(filename: string, content: string): string {
		const filePath = path.join(tempDir, filename)
		fs.writeFileSync(filePath, content)
		return filePath
	}

	describe("Successful Loading", () => {
		it("loads a file with default export (single object)", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { rules: { "no-foo": "error" } };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ rules: { "no-foo": "error" } })
		})

		it("loads a file with default export (array of objects)", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default [
          { rules: { "no-foo": "error" } },
          { plugins: ["my-plugin"] }
        ];`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual([
				{ rules: { "no-foo": "error" } },
				{ plugins: ["my-plugin"] },
			])
		})

		it("loads a file with named config export (single object)", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export const config = { rules: { "no-bar": "warn" } };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ rules: { "no-bar": "warn" } })
		})

		it("loads a file with named config export (array)", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export const config = [
          { options: { strict: true } },
          { views: ["src/**/*.tsx"] }
        ];`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual([
				{ options: { strict: true } },
				{ views: ["src/**/*.tsx"] },
			])
		})

		it("default export takes priority over named config when both exist", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`
        export default { rules: { "from-default": "error" } };
        export const config = { rules: { "from-named": "error" } };
        `,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ rules: { "from-default": "error" } })
		})
	})

	describe("Valid ConfigObject Keys", () => {
		it("accepts object with only plugins key", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { plugins: ["plugin-a", "plugin-b"] };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ plugins: ["plugin-a", "plugin-b"] })
		})

		it("accepts object with only rules key", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { rules: { "rule-1": "off" } };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ rules: { "rule-1": "off" } })
		})

		it("accepts object with only options key", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { options: { debug: true } };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ options: { debug: true } })
		})

		it("accepts object with only views key", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { views: ["**/*.vue"] };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ views: ["**/*.vue"] })
		})

		it("accepts object with only scopes key", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { scopes: ["frontend", "backend"] };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ scopes: ["frontend", "backend"] })
		})

		it("accepts object with multiple allowed keys", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { 
          plugins: ["plugin-x"],
          rules: { "rule-y": "error" },
          options: { verbose: true }
        };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({
				plugins: ["plugin-x"],
				rules: { "rule-y": "error" },
				options: { verbose: true },
			})
		})

		it("accepts object with all five allowed keys", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { 
          plugins: ["p1"],
          rules: { r1: "warn" },
          options: { o1: 1 },
          views: ["v1"],
          scopes: ["s1"]
        };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({
				plugins: ["p1"],
				rules: { r1: "warn" },
				options: { o1: 1 },
				views: ["v1"],
				scopes: ["s1"],
			})
		})
	})

	describe("Empty Export Handling", () => {
		it("warns and returns empty array when file has no exports", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const filePath = writeConfig("config.mjs", `const unused = 42;`)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual([])
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					`ViewLint config file '${filePath}' did not export anything.`,
				),
			)
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"It is being treated as an empty configuration file.",
				),
			)
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"If this is intentional, export default [] instead of leaving the file without exports.",
				),
			)
		})

		it("warns and returns empty array when default export is undefined and no named config", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const filePath = writeConfig("config.mjs", `export default undefined;`)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual([])
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					`ViewLint config file '${filePath}' did not export anything.`,
				),
			)
		})

		it("warns and returns empty array when both default and config are undefined", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const filePath = writeConfig(
				"config.mjs",
				`
        export default undefined;
        export const config = undefined;
        `,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual([])
			expect(warnSpy).toHaveBeenCalled()
		})
	})

	describe("Invalid Configs", () => {
		it("throws when module export is not an object", async () => {
			const filePath = writeConfig("config.mjs", `module.exports = "not-esm";`)

			// This tests module-level validation - the module itself should export an object
			// Using CommonJS in .mjs may cause different behavior, so let's test with a proper scenario
			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow()
		})

		it("throws when export is a primitive string", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default "invalid-string";`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when export is a primitive number", async () => {
			const filePath = writeConfig("config.mjs", `export default 42;`)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when export is a primitive boolean", async () => {
			const filePath = writeConfig("config.mjs", `export default true;`)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when export is null", async () => {
			const filePath = writeConfig("config.mjs", `export default null;`)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when export is an empty object (no keys)", async () => {
			const filePath = writeConfig("config.mjs", `export default {};`)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				"ConfigObject or ConfigObject[]",
			)
		})

		it("throws when export has disallowed keys", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { foo: "bar" };`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when export has mix of allowed and disallowed keys", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { 
          rules: { "valid-rule": "error" },
          invalidKey: "should fail"
        };`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when array contains one valid and one invalid item", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default [
          { rules: { "valid": "error" } },
          { invalidKey: "bad" }
        ];`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				"ConfigObject[]",
			)
		})

		it("throws when array contains an empty object", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default [
          { rules: { "valid": "error" } },
          {}
        ];`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when array contains a primitive", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default [
          { rules: { "valid": "error" } },
          "not-an-object"
        ];`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("throws when array contains null", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default [
          { rules: { "valid": "error" } },
          null
        ];`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("error message for invalid single object mentions ConfigObject or ConfigObject[]", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { badKey: true };`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				"Expected default export to be ConfigObject or ConfigObject[]",
			)
		})

		it("error message for invalid array item mentions ConfigObject[]", async () => {
			const filePath = writeConfig("config.mjs", `export default [{ bad: 1 }];`)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				"Expected default export to be ConfigObject[]",
			)
		})
	})

	describe("Edge Cases", () => {
		it("handles file path with spaces", async () => {
			const dirWithSpaces = path.join(tempDir, "path with spaces")
			fs.mkdirSync(dirWithSpaces, { recursive: true })
			const filePath = path.join(dirWithSpaces, "config.mjs")
			fs.writeFileSync(
				filePath,
				`export default { rules: { "space-rule": "error" } };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ rules: { "space-rule": "error" } })
		})

		it("handles very deeply nested config values", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { 
          options: { 
            level1: { 
              level2: { 
                level3: { 
                  level4: { 
                    level5: { 
                      deep: "value" 
                    } 
                  } 
                } 
              } 
            } 
          } 
        };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({
				options: {
					level1: {
						level2: {
							level3: {
								level4: {
									level5: {
										deep: "value",
									},
								},
							},
						},
					},
				},
			})
		})

		it("handles config with complex nested arrays and objects in values", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { 
          plugins: [
            { name: "plugin1", options: [1, 2, 3] },
            ["nested", "array"]
          ],
          rules: {
            "complex-rule": ["error", { nested: { option: true } }]
          }
        };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({
				plugins: [{ name: "plugin1", options: [1, 2, 3] }, ["nested", "array"]],
				rules: {
					"complex-rule": ["error", { nested: { option: true } }],
				},
			})
		})

		it("handles empty array as valid default export", async () => {
			const filePath = writeConfig("config.mjs", `export default [];`)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual([])
		})

		it("uses named config export when default is undefined", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const filePath = writeConfig(
				"config.mjs",
				`
        export default undefined;
        export const config = { rules: { "from-named": "error" } };
        `,
			)

			// Based on spec: if default is undefined, it should fall back to named config
			// But spec also says "if both are undefined" - so if config has value, use it
			const result = await loadViewlintConfigFromFile(filePath)

			// If implementation checks default first and it's undefined, falls back to config
			expect(result).toEqual({ rules: { "from-named": "error" } })
			expect(warnSpy).not.toHaveBeenCalled()
		})

		it("handles config file that exports a function (should fail)", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default function() { return { rules: {} }; };`,
			)

			await expect(loadViewlintConfigFromFile(filePath)).rejects.toThrow(
				`Invalid viewlint config file '${filePath}'`,
			)
		})

		it("handles config file that exports a class instance (accepts if has only allowed keys)", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`
        class Config { rules = {} }
        export default new Config();
        `,
			)

			// Class instances are accepted because isRecord only checks typeof === 'object' && !== null
			// and isConfigObject only checks for allowed keys
			const result = await loadViewlintConfigFromFile(filePath)

			expect(result).toEqual({ rules: {} })
		})
	})

	describe("Return Value Structure", () => {
		it("returns single object as-is, not wrapped in array", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default { rules: { test: "error" } };`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(Array.isArray(result)).toBe(false)
			expect(result).toEqual({ rules: { test: "error" } })
		})

		it("returns array when export is array", async () => {
			const filePath = writeConfig(
				"config.mjs",
				`export default [{ rules: { test: "error" } }];`,
			)

			const result = await loadViewlintConfigFromFile(filePath)

			expect(Array.isArray(result)).toBe(true)
			expect(result).toEqual([{ rules: { test: "error" } }])
		})
	})
})
