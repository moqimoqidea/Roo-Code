import * as path from "path"

import { runTests } from "@vscode/test-electron"

async function main() {
	const extensionDevelopmentPath = path.resolve(__dirname, "../../../")
	const extensionTestsPath = path.resolve(__dirname, "./runExercise")

	await runTests({
		extensionDevelopmentPath: extensionDevelopmentPath,
		extensionTestsPath: extensionTestsPath,
		launchArgs: ["foo", "bar", "baz"],
	})
}

main()
	.then(() => {
		console.log("👍")
	})
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
