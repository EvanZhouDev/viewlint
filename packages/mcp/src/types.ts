import { z } from "zod"

export const lintUrlsInputSchema = {
	urls: z.array(z.url()).nonempty(),
	configFile: z.string().min(1).optional(),
}

export type LintUrlsInput = z.infer<z.ZodObject<typeof lintUrlsInputSchema>>
