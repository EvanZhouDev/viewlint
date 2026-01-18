import type { ConfigObject } from "../src/types.js"

export type InfiniteArray<T> = T | Array<InfiniteArray<T>>

export type ExtendsElement = string | InfiniteArray<ConfigWithExtends>

export type ConfigWithExtends = ConfigObject & {
	extends?: readonly ExtendsElement[]
}

export type ConfigWithExtendsArray = InfiniteArray<ConfigWithExtends>[]
