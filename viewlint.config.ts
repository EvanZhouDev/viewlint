import rules from "@viewlint/rules";
import { defineConfig } from "viewlint/config";

export default defineConfig({
	...rules.configs.all,
	scenes: {
		yt: {
			url: "https://www.youtube.com",
			roots: [({ page }) => page.locator("#content-wrapper")],
		},
	},
});
