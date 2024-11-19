# sambyeol/publish-pytest-action

This action analyses the pytest result files and publishes the report as a
comment on a pull requests.

## Quick start

```yaml
permissions:
  contents: read
  pull-requests: write # Required for posting comments

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    ...
    - name: Run tests
      run: |
        pytest . --junitxml=junit/test-results.xml
    - name: Publish pytest report
      uses: sambyeol/publish-pytest-action@v2
      if: ${{ always() }} # Even if the tests fail, publish the report
      with:
        junit-xml: junit/test-results.xml
```

## Configuration

The action can be configured with the following options:

| Option         |     Default     | Description                                                                                                                                                                         |
| :------------- | :-------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `junit-xml`    |   _required_    | The path to the JUnit XML file. This can be generated by running pytest with the `--junitxml` option.                                                                               |
| `coverage-xml` |     _null_      | The path to the coverage XML file. This can be generated by running pytest with the `--cov=<your-module> --cov-report xml` options. These options require the `pytest-cov` package. |
| `title`        | `Pytest Report` | The title of the comment.                                                                                                                                                           |
