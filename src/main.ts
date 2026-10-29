import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {
  childEnv,
  cliSpecifier,
  DENO_VERSION,
  publishArgs,
  readInputs
} from './args.js'
import { cacheCli, installDeno } from './install.js'
import { report } from './result.js'

/**
 * The main function for the action: install Deno and the CLI, run
 * `skmtc api publish` and map its result.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Masked before anything else can print it. Empty means OIDC.
    const token = core.getInput('token')
    if (token) {
      core.setSecret(token)
    } else {
      core.info('token is empty: the CLI signs in with GitHub Actions OIDC.')
      if (process.env.SKMTC_HUB_TOKEN) {
        core.info(
          'The action ignores SKMTC_HUB_TOKEN in the environment; set `token`.'
        )
      }
    }

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
      publishArgs(inputs, specifier, lockFlags, token, process.env),
      { env: childEnv(process.env, token), ignoreReturnCode: true }
    )

    await report(output, inputs.file, installLine)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
