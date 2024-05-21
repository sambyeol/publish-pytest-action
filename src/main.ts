import * as core from '@actions/core'
import * as github from '@actions/github'
import { XMLParser } from 'fast-xml-parser'
import { readFile } from 'fs/promises'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const parser = new XMLParser({ ignoreAttributes: false })

    const junitXml: string = core.getInput('junit-xml', { required: true })
    const testResultsString = await readFile(junitXml, 'utf8')
    const testResults = parser.parse(testResultsString).testsuites.testsuite
    core.debug(`Test results loaded: ${junitXml}`)

    const nTests = testResults['@_tests']
    const nErrors = testResults['@_errors']
    const nFailures = testResults['@_failures']
    const nSkipped = testResults['@_skipped']

    core.setOutput('failed', `${nFailures} failures`)

    const coverageXml: string = core.getInput('coverage-xml', {
      required: true
    })
    const coverageString = await readFile(coverageXml, 'utf8')
    const coverage = parser.parse(coverageString).coverage
    core.debug(`Coverage loaded: ${coverageXml}`)

    const nValidLines = coverage['@_lines-valid']
    const nCoveredLines = coverage['@_lines-covered']
    const nLineRate = parseFloat(coverage['@_line-rate']) * 100

    core.setOutput('coverage', `${nLineRate}% coverage`)

    const context = github.context
    const token = core.getInput('github-token', { required: true })
    const octokit = github.getOctokit(token)
    if (context.eventName === 'pull_request') {
      core.debug(
        `Comment to ${context.repo.owner}/${context.repo.repo} #${context.issue.number}`
      )
      octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: context.issue.number,
        body: `# Test Results
- Tests: ${nTests}
- Errors: ${nErrors}
- Failures: ${nFailures}
- Skipped: ${nSkipped}

# Coverage Results
- Valid Lines: ${nValidLines}
- Covered Lines: ${nCoveredLines}
- Line Rate: ${nLineRate}%
`
      })
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
