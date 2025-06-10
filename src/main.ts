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
    const titleString = core.getInput('title', { required: false })


    const COMMENT_FOOTER =
      'Comment by :sparkles:[sambyeol/publish-pytest-action](https://github.com/sambyeol/publish-pytest-action)'
    const ACTION_COMMENT_MARKER = '<!-- GHA-PUBLISH-PYTEST-ACTION-COMMENT -->'

    let reportBodyContent = `# ${titleString}`

    const parser = new XMLParser({ ignoreAttributes: false })

    const junitXml = core.getInput('junit-xml', { required: true })
    const testResultsString = await readFile(junitXml, 'utf8')
    const testResults = parser.parse(testResultsString).testsuites.testsuite
    core.debug(`Test results loaded: ${junitXml}`)

    const nTests = testResults['@_tests']
    const nErrors = testResults['@_errors']
    const nFailures = testResults['@_failures']
    const nSkipped = testResults['@_skipped']

    core.setOutput('failed', `${nFailures} failures`)
    reportBodyContent = `${reportBodyContent}

## Test Results
- Tests: ${nTests}
- Errors: ${nErrors}
- Failures: ${nFailures}
- Skipped: ${nSkipped}
`

    const coverageXml = core.getInput('coverage-xml', {
      required: false
    })
    if (coverageXml) {
      const coverageString = await readFile(coverageXml, 'utf8')
      const coverage = parser.parse(coverageString).coverage
      core.debug(`Coverage loaded: ${coverageXml}`)

      const nValidLines = coverage['@_lines-valid']
      const nCoveredLines = coverage['@_lines-covered']
      const nLineRate = parseFloat(coverage['@_line-rate']) * 100

      core.setOutput('coverage', `${nLineRate}% coverage`)
      reportBodyContent = `${reportBodyContent}

## Coverage Results
- Valid Lines: ${nValidLines}
- Covered Lines: ${nCoveredLines}
- Line Rate: ${nLineRate}%
`
    }

    let contentForGithubComment = reportBodyContent

    const commentMode = core.getInput('comment-mode', { required: false })
    const commentIdentifier = core.getInput('comment-identifier', {
      required: false
    })
    const IDENTIFIER_PREFIX = '<!-- IDENTIFIER: '
    const IDENTIFIER_SUFFIX = ' -->'

    function parseCommentIdentifier(
      commentBody: string | null | undefined
    ): string | null {
      if (!commentBody) return null
      const startIndex = commentBody.indexOf(IDENTIFIER_PREFIX)
      if (startIndex === -1) return null
      const endIndex = commentBody.indexOf(
        IDENTIFIER_SUFFIX,
        startIndex + IDENTIFIER_PREFIX.length
      )
      if (endIndex === -1) return null
      return commentBody.substring(
        startIndex + IDENTIFIER_PREFIX.length,
        endIndex
      )
    }

    if (
      ['update', 'hide', 'delete'].includes(commentMode) &&
      !commentIdentifier &&
      github.context.eventName === 'pull_request'
    ) {
      const warningMessage = `:warning: **Warning:** \`comment-mode\` was set to '${commentMode}' but no \`comment-identifier\` was provided. This comment is new; no previous comments were modified. Please check a \`comment-identifier\` to enable managing comments specific to this job configuration.`
      contentForGithubComment =
        warningMessage + '\n\n---\n\n' + contentForGithubComment
    }

    let fullCommentBody = contentForGithubComment + `

${COMMENT_FOOTER}
${ACTION_COMMENT_MARKER}`
    if (commentIdentifier) {
      fullCommentBody += `
${IDENTIFIER_PREFIX}${commentIdentifier}${IDENTIFIER_SUFFIX}`
    }

    const context = github.context
    const token = core.getInput('github-token', { required: true })
    const octokit = github.getOctokit(token)

    let commentCreatedOrUpdated = false

    if (context.eventName === 'pull_request' && context.issue.number) {
      core.debug(
        `Processing for PR #${context.issue.number} in ${context.repo.owner}/${context.repo.repo}`
      )
      core.debug(`Comment mode: ${commentMode}`)
      if (commentIdentifier) {
        core.debug(`Comment identifier: ${commentIdentifier}`)
      }

      try {
        const { data: existingComments } =
          await octokit.rest.issues.listComments({
            ...context.repo,
            issue_number: context.issue.number
          })

        const allActionComments = existingComments.filter(
          comment =>
            comment.user?.login === 'github-actions[bot]' &&
            comment.body?.includes(ACTION_COMMENT_MARKER)
        )
        core.debug(`Found ${allActionComments.length} total comments by this action.`)

        const commentsToProcess = commentIdentifier ? allActionComments
          .filter(
            comment => parseCommentIdentifier(comment.body) === commentIdentifier
          )
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          ) : [];
        core.debug(
          `Found ${commentsToProcess.length} comments with identifier '${commentIdentifier}'.`
        )

        if (commentIdentifier) { // Only process if identifier is provided
          if (commentMode === 'update') {
            for (const comment of commentsToProcess) {
              core.debug(`Updating comment ID: ${comment.id} with identifier '${commentIdentifier}'`)
              await octokit.rest.issues.updateComment({
                ...context.repo,
                comment_id: comment.id,
                body: fullCommentBody
              })
              commentCreatedOrUpdated = true
              core.info(`Updated previous comment ID: ${comment.id}`)
            }
          } else if (commentMode === 'hide') {
            for (const comment of commentsToProcess) {
              core.debug(`Hiding comment ID: ${comment.id} (Node ID: ${comment.node_id})`)
              try {
                await octokit.graphql({
                  query: `mutation($input: MinimizeCommentInput!) { minimizeComment(input: $input) { minimizedComment { isMinimized } } }`,
                  input: {
                    subjectId: comment.node_id,
                    classifier: 'OUTDATED'
                  }
                })
                core.info(`Hid comment ID: ${comment.id}`)
              } catch (gqlError) {
                core.warning(`Failed to hide comment ID ${comment.id}: ${gqlError instanceof Error ? gqlError.message : gqlError}`)
              }
            }
          } else if (commentMode === 'delete') {
            core.debug(`Executing "delete" strategy for comments with identifier '${commentIdentifier}'.`)
            for (const comment of commentsToProcess) {
              core.debug(`Deleting comment ID: ${comment.id}`)
              await octokit.rest.issues.deleteComment({
                ...context.repo,
                comment_id: comment.id
              })
              core.info(`Deleted comment ID: ${comment.id}`)
            }
          }
        }
      } catch (apiError) {
        core.warning(
          `Error processing comments: ${apiError instanceof Error ? apiError.message : apiError}`
        )
      }
      if (!commentCreatedOrUpdated) {
        core.debug('Creating a new comment.')
        await octokit.rest.issues.createComment({
          ...context.repo,
          issue_number: context.issue.number,
          body: fullCommentBody
        })
        core.info('Created a new comment.')
      }
    } else if (context.eventName !== 'pull_request') {
      core.info('Not a pull request, skipping comment creation/management.')
    } else if (!context.issue.number) {
      core.warning('Could not get pull request number from context, skipping comment creation/management.')
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
