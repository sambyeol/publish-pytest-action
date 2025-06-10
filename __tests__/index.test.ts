import { run } from '../src/main' // Adjust if main is not directly in src
import * as core from '@actions/core'
import * as github from '@actions/github'
import { promises as fs } from 'fs'

// Mock @actions/core
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn()
}))

// Mock @actions/github
const mockOctokit = {
  rest: {
    issues: {
      createComment: jest.fn(),
      listComments: jest.fn(),
      updateComment: jest.fn(),
      deleteComment: jest.fn()
    }
  },
  graphql: jest.fn()
}
jest.mock('@actions/github', () => ({
  getOctokit: jest.fn().mockReturnValue(mockOctokit),
  context: {
    eventName: 'pull_request',
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    },
    issue: {
      number: 123
    },
    payload: {} // Add more payload details if needed by the action
  }
}))

// Mock fs/promises
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}))

// Keep a reference to the original console for debugging if necessary
// const originalConsole = console

describe('Previous Comment Handling in main.ts', () => {
  const COMMENT_MARKER =
    'Comment by :sparkles:[sambyeol/publish-pytest-action](https://github.com/sambyeol/publish-pytest-action)'

  const mockActionComment = (
    id: number,
    node_id: string,
    created_at: string,
    bodyContent = 'Previous results'
  ) => ({
    id,
    node_id,
    user: { login: 'github-actions[bot]', type: 'Bot' },
    body: `${bodyContent}
${COMMENT_MARKER}`,
    created_at: new Date(created_at).toISOString() // Ensure ISO format
  })

  const mockUserComment = (
    id: number,
    node_id: string,
    created_at: string,
    login = 'some-user',
    bodyContent = 'Some other comment'
  ) => ({
    id,
    node_id,
    user: { login, type: 'User' },
    body: bodyContent,
    created_at: new Date(created_at).toISOString()
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Default Mocks
    ;(core.getInput as jest.Mock).mockImplementation((name: string) => {
      switch (name) {
        case 'github-token':
          return 'fake-token'
        case 'junit-xml':
          return 'path/to/results.xml'
        case 'coverage-xml':
          return 'path/to/coverage.xml' // Assume coverage is often provided
        case 'title':
          return 'Test Report'
        case 'comment-mode':
          return 'new' // Default for many tests unless overridden
        default:
          return ''
      }
    })
    ;(fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.includes('results.xml')) {
        return Promise.resolve(`
          <testsuites>
            <testsuite tests="1" failures="0" errors="0" skipped="0">
              <testcase name="dummy test" classname="dummy"/>
            </testsuite>
          </testsuites>
        `)
      }
      if (path.includes('coverage.xml')) {
        return Promise.resolve(`
          <coverage lines-valid="10" lines-covered="5" line-rate="0.5">
          </coverage>
        `)
      }
      return Promise.reject(new Error(`File not found: ${path}`))
    })

    // Default API responses
    mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] })
    mockOctokit.rest.issues.createComment.mockResolvedValue({ data: { id: 999, node_id: 'node_id_new' } as any })
    mockOctokit.rest.issues.updateComment.mockResolvedValue({ data: {} as any })
    mockOctokit.rest.issues.deleteComment.mockResolvedValue({ status: 204 } as any)
    mockOctokit.graphql.mockResolvedValue({ data: {} } as any) // Default GraphQL mock

    // Reset context for safety, though it's usually static in these tests
    github.context.eventName = 'pull_request'
    github.context.issue.number = 123
    github.context.repo.owner = 'test-owner'
    github.context.repo.repo = 'test-repo'
  })

  // Test cases for 'new'
  describe("comment-mode: 'new'", () => {
    beforeEach(() => {
      ;(core.getInput as jest.Mock).mockImplementation(name => {
        if (name === 'comment-mode') return 'new'
        if (name === 'github-token') return 'fake-token'
        if (name === 'junit-xml') return 'results.xml'
        if (name === 'title') return 'Test Report'
        return ''
      })
    })

    it('should create a new comment when no previous comments exist', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('# Test Report')
        })
      )
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
    })

    it('should create a new comment even if one action comment exists', async () => {
      const prevComment = mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z')
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [prevComment] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
    })

    it('should create a new comment even if multiple action comments exist', async () => {
      const prevComments = [
        mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z'),
        mockActionComment(2, 'node_id_2', '2023-01-02T10:00:00Z')
      ]
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: prevComments })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
    })

     it('should create a new comment when only other user comments exist', async () => {
      const userComment = mockUserComment(1, 'node_id_user', '2023-01-01T10:00:00Z')
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [userComment] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
    })
  })

  // Test cases for 'delete'
  describe("comment-mode: 'delete'", () => {
    beforeEach(() => {
      ;(core.getInput as jest.Mock).mockImplementation(name => {
        if (name === 'comment-mode') return 'delete'
        if (name === 'github-token') return 'fake-token'
        if (name === 'junit-xml') return 'results.xml'
        if (name === 'title') return 'Test Report'
        return ''
      })
    })

    it('should create a new comment if no previous action comments exist', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
    })

    it('should delete one previous action comment and create a new one', async () => {
      const prevComment = mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z')
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [prevComment, mockUserComment(99, 'node_id_99', '2023-01-01T09:00:00Z')] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: prevComment.id })
      )
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
    })

    it('should delete multiple previous action comments and create a new one', async () => {
      const prevComments = [
        mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z'),
        mockActionComment(2, 'node_id_2', '2023-01-02T10:00:00Z', 'Older comment'),
        mockUserComment(99, 'node_id_99', '2023-01-01T09:00:00Z')
      ]
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: prevComments })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: prevComments[0].id })
      )
      expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: prevComments[1].id })
      )
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
    })
  })

  // Test cases for 'hide'
  describe("comment-mode: 'hide'", () => {
    const minimizeQuery = `mutation($input: MinimizeCommentInput!) { minimizeComment(input: $input) { minimizedComment { isMinimized } } }`
    beforeEach(() => {
      ;(core.getInput as jest.Mock).mockImplementation(name => {
        if (name === 'comment-mode') return 'hide'
        if (name === 'github-token') return 'fake-token'
        if (name === 'junit-xml') return 'results.xml'
        if (name === 'title') return 'Test Report'
        return ''
      })
    })

    it('should create a new comment if no previous action comments exist', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
    })

    it('should hide one previous action comment and create a new one', async () => {
      const prevComment = mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z')
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [prevComment, mockUserComment(99, 'node_id_99', '2023-01-01T09:00:00Z')] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.graphql).toHaveBeenCalledTimes(1)
      expect(mockOctokit.graphql).toHaveBeenCalledWith({
        query: minimizeQuery,
        input: { subjectId: prevComment.node_id, classifier: 'OUTDATED' }
      })
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
    })

    it('should hide multiple previous action comments and create a new one', async () => {
      const prevComments = [
        mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z'),
        mockActionComment(2, 'node_id_2', '2023-01-02T10:00:00Z', 'Older comment')
      ]
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [...prevComments, mockUserComment(99, 'node_id_99', '2023-01-01T09:00:00Z')]})
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.graphql).toHaveBeenCalledTimes(2)
      expect(mockOctokit.graphql).toHaveBeenCalledWith({
        query: minimizeQuery,
        input: { subjectId: prevComments[0].node_id, classifier: 'OUTDATED' }
      })
      expect(mockOctokit.graphql).toHaveBeenCalledWith({
        query: minimizeQuery,
        input: { subjectId: prevComments[1].node_id, classifier: 'OUTDATED' }
      })
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
    })

     it('should not try to hide comments without node_id', async () => {
      const prevCommentNoNodeId = { ...mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z'), node_id: undefined } as any
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [prevCommentNoNodeId] })
      await run()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("does not have a node_id, cannot hide"))
    })
  })

  // Test cases for 'update'
  describe("comment-mode: 'update'", () => {
    const newBodyContent = expect.stringContaining('# Test Report') // Simplified, check main.ts for exact body

    beforeEach(() => {
      ;(core.getInput as jest.Mock).mockImplementation(name => {
        if (name === 'comment-mode') return 'update'
        if (name === 'github-token') return 'fake-token'
        if (name === 'junit-xml') return 'results.xml'
        if (name === 'title') return 'Test Report' // Make sure body check matches this
        return ''
      })
    })

    it('should create a new comment if no previous action comments exist', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: newBodyContent })
      )
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
    })

    it('should update one previous action comment and not create a new one', async () => {
      const prevComment = mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z')
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [prevComment,  mockUserComment(99, 'node_id_99', '2023-01-01T09:00:00Z')] })
      await run()
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          comment_id: prevComment.id,
          body: newBodyContent
        })
      )
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled()
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
    })

    it('should update the most recent action comment, delete older ones, and not create a new one', async () => {
      // Comments sorted by listComments (most recent first)
      const recentComment = mockActionComment(2, 'node_id_2', '2023-01-02T10:00:00Z', 'Recent comment')
      const olderComment = mockActionComment(1, 'node_id_1', '2023-01-01T10:00:00Z', 'Older comment')
      const userComment = mockUserComment(99, 'node_id_99', '2023-01-01T09:00:00Z')

      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [recentComment, olderComment, userComment] })
      await run()

      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          comment_id: recentComment.id, // Should update the most recent
          body: newBodyContent
        })
      )
      expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: olderComment.id }) // Should delete the older one
      )
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled()
      expect(mockOctokit.graphql).not.toHaveBeenCalled()
    })

     it('should handle API error during comment processing and still attempt to create a new comment if update fails initially', async () => {
      ;(core.getInput as jest.Mock).mockImplementation(name => {
        if (name === 'comment-mode') return 'update';
        if (name === 'github-token') return 'fake-token';
        if (name === 'junit-xml') return 'results.xml';
        if (name === 'title') return 'Test Report';
        return '';
      });

      mockOctokit.rest.issues.listComments.mockRejectedValueOnce(new Error('API List Error'));

      await run();

      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1);
      // The main 'run' function catches the error from listComments, logs it,
      // and then proceeds to the fallback logic if commentCreatedOrUpdated is false.
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Error processing comments: API List Error'));
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1); // Fallback
      expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.deleteComment).not.toHaveBeenCalled();
      expect(mockOctokit.graphql).not.toHaveBeenCalled();
    });
  })
})
