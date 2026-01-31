import fs from "node:fs/promises"
import path from "node:path"

export type PackageJson = {
	name: string
	private: true
	version: string
}

function sanitizePackageName(name: string): string {
	const lower = name.trim().toLowerCase()

	const cleaned = lower
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "")

	const withoutForbiddenPrefix = cleaned.replace(/^[._-]+/, "")

	if (withoutForbiddenPrefix.length === 0) {
		throw new Error(
			`Cannot derive a valid package name from '${name}'. Create a package.json manually and re-run.`,
		)
	}

	return withoutForbiddenPrefix
}

export function derivePackageNameFromCwd(cwd: string): string {
	const baseName = path.basename(cwd)
	return sanitizePackageName(baseName)
}

export function renderPackageJson(opts: { cwd: string }): {
	filePath: string
	contents: string
	packageName: string
} {
	const packageName = derivePackageNameFromCwd(opts.cwd)
	const filePath = path.join(opts.cwd, "package.json")

	const pkg: PackageJson = {
		name: packageName,
		private: true,
		version: "0.0.0",
	}

	return {
		filePath,
		contents: `${JSON.stringify(pkg, null, 2)}\n`,
		packageName,
	}
}

export async function writePackageJsonIfMissing(opts: {
	cwd: string
	runtime?: {
		stat?: (filePath: string) => Promise<{ isFile(): boolean }>
		writeFile?: (
			filePath: string,
			contents: string,
			encoding: "utf8",
		) => Promise<void>
	}
}): Promise<{ filePath: string; packageName: string } | null> {
	const stat = opts.runtime?.stat ?? fs.stat
	const writeFile = opts.runtime?.writeFile ?? fs.writeFile

	const rendered = renderPackageJson({ cwd: opts.cwd })

	try {
		const stats = await stat(rendered.filePath)
		if (!stats.isFile()) {
			throw new Error(`Expected ${rendered.filePath} to be a file.`)
		}
		return null
	} catch {
		// Missing: create it.
	}

	await writeFile(rendered.filePath, rendered.contents, "utf8")
	return { filePath: rendered.filePath, packageName: rendered.packageName }
}
