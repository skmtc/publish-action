import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { childEnv, cliSpecifier, publishArgs, readInputs } from './args.js'
import { cacheCli, DENO_VERSION, installDeno } from './install.js'
import { report } from './result.js'

/**
 * The main function for the action: install Deno and the CLI, run
 * `skmtc api publish` and map its result.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Masked before anything else can print it.
    const token = core.getInput('token', { required: true })
    core.setSecret(token)

    const inputs = readInputs()
    const { specifier, overridden, lockFlags } = cliSpecifier(
      inputs.cliVersion,
      process.env
    )

    const started = Date.now()
    const { deno, cached } = await installDeno()
    if (!overridden) {
      await cacheCli(deno, specifier, lockFlags)
    }
    const cli = overridden ? specifier : `@skmtc/cli ${inputs.cliVersion}`
    const installLine = `Installed Deno ${DENO_VERSION} and ${cli} in ${Date.now() - started} ms (deno cached: ${cached ? 'yes' : 'no'})`
    core.info(installLine)

    const output = await exec.getExecOutput(
      deno,
      publishArgs(inputs, specifier, lockFlags),
      { env: childEnv(process.env, token), ignoreReturnCode: true }
    )

    await report(output, inputs.file, installLine)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
