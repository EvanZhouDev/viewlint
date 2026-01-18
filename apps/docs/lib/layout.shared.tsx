import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: (
				<>
					<svg
						width="24"
						viewBox="0 0 243 243"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						style={{ marginRight: "-3px" }}
					>
						<title>ViewLint Logo</title>
						<g clipPath="url(#clip0_205_24)">
							<rect
								x="84.0625"
								y="147.299"
								width="105.898"
								height="33.5135"
								transform="rotate(-45 84.0625 147.299)"
								fill="currentColor"
							/>
							<rect
								width="33.5135"
								height="67.0271"
								transform="matrix(0.707107 -0.707107 -0.707107 -0.707107 107.762 171)"
								fill="currentColor"
							/>
							<rect x="40" width="203" height="40" fill="currentColor" />
							<rect
								width="40"
								height="163"
								transform="matrix(1 0 0 -1 203 203)"
								fill="currentColor"
							/>
							<rect
								x="203"
								y="243.002"
								width="203"
								height="40"
								transform="rotate(180 203 243.002)"
								fill="currentColor"
							/>
							<rect
								width="40"
								height="163"
								transform="matrix(-1 4.48205e-08 4.48205e-08 1 40 40)"
								fill="currentColor"
							/>
						</g>
						<defs>
							<clipPath id="clip0_205_24">
								<rect width="243" height="243" fill="white" />
							</clipPath>
						</defs>
					</svg>
					<h1 style={{ fontSize: "20px" }}>ViewLint</h1>
				</>
			),
		},
	}
}
