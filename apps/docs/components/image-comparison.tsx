"use client"

import { ImgComparisonSlider } from "@img-comparison-slider/react"
import { cn } from "@/lib/cn"

export type ImageComparisonProps = {
	beforeSrc: string
	beforeAlt: string

	afterSrc: string
	afterAlt: string

	beforeLabel?: string
	afterLabel?: string

	className?: string
}

export function ImageComparison({
	beforeSrc,
	beforeAlt,
	afterSrc,
	afterAlt,
	beforeLabel,
	afterLabel,
	className,
}: ImageComparisonProps) {
	return (
		<div className={cn("my-6", className)}>
			<ImgComparisonSlider
				value={90}
				className={cn(
					"block w-full overflow-hidden rounded-xl border",
					"[--divider-width:3px] [--divider-color:#000] [--default-handle-weight:64px] [--default-handle-color:#000] [--default-handle-opacity:1]",
				)}
			>
				<div slot="first" className="relative block w-full !m-0">
					<img
						src={beforeSrc}
						alt={beforeAlt}
						className="block h-auto w-full !m-0 select-none"
						draggable={false}
					/>
					<div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/75 px-2 py-1 text-[10px] font-medium tracking-wide text-white backdrop-blur block leading-tight">
						{beforeLabel}
					</div>
				</div>
				<svg
					slot="handle"
					xmlns="http://www.w3.org/2000/svg"
					width="100"
					viewBox="-8 -3 16 6"
				>
					<title>Image Comparison Drag Handle</title>
					<path
						stroke="#000"
						d="M -4 -2 L -6 0 L -4 2 M -4 -2 L -4 2 M 4 -2 L 6 0 L 4 2 M 4 -2 L 4 2"
						strokeWidth="1"
						fill="#000"
						vectorEffect="non-scaling-stroke"
					></path>
				</svg>
				<div slot="second" className="relative block w-full !m-0">
					<img
						src={afterSrc}
						alt={afterAlt}
						className="block h-auto w-full !m-0 select-none"
						draggable={false}
					/>
					<div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/75 px-2 py-1 text-[10px] font-medium tracking-wide text-white backdrop-blur block leading-tight">
						{afterLabel}
					</div>
				</div>
			</ImgComparisonSlider>
		</div>
	)
}
