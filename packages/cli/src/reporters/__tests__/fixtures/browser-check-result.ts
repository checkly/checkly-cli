export const browserCheckResult = {
  "logicalId": "src/__checks__/folder/my-test.spec.ts",
  "sourceFile": "src/__checks__/folder/browser.check.ts",
  "sourceInfo": {
    "checkRunId": "ebefe140-29bf-4650-9e89-6e36a5c092ef",
    "checkRunSuiteId": "2b938869-e38b-4599-b3b0-901aeea4bbef",
    "ephemeral": true
  },
  "checkRunId": "702961fd-7e2c-45f0-97be-1aa9eabd4d82",
  "checkType": "BROWSER",
  "name": "my-test.spec.ts",
  "hasErrors": false,
  "hasFailures": false,
  "attempts": 1,
  "startedAt": "2023-03-24T10:53:15.761Z",
  "stoppedAt": "2023-03-24T10:53:22.283Z",
  "responseTime": 6522,
  "aborted": false,
  "runLocation": "eu-west-1",
  "logFile": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202477/702961fd-7e2c-45f0-97be-1aa9eabd4d82/out.log",
  "metadata": {
    "startTime": 1679655195813,
    "errors": [],
    "endTime": 1679655202283,
    "type": "PLAYWRIGHT_TEST",
    "runtimeVersion": "2022.10",
    "playwrightTraceFiles": [
      {
        "name": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202627/702961fd-7e2c-45f0-97be-1aa9eabd4d82/script-visit-page-and-take-screenshot-chromium.zip",
        "url": "https://s3.eu-west-1.amazonaws.com/fn-check-run-data-eu-west-1-prod/cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202627/702961fd-7e2c-45f0-97be-1aa9eabd4d82/script-visit-page-and-take-screenshot-chromium.zip",
        "filename": "script-visit-page-and-take-screenshot-chromium.zip"
      }
    ],
    "playwrightTestVideos": [
      {
        "name": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202773/702961fd-7e2c-45f0-97be-1aa9eabd4d82/visit-page-and-take-screenshot-1679655201832.webm",
        "url": "https://s3.eu-west-1.amazonaws.com/fn-check-run-data-eu-west-1-prod/cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202773/702961fd-7e2c-45f0-97be-1aa9eabd4d82/visit-page-and-take-screenshot-1679655201832.webm",
        "filename": "visit-page-and-take-screenshot-1679655201832.webm"
      }
    ],
    "traceSummary": {
      "networkErrors": 1,
      "consoleErrors": 1,
      "userScriptErrors": 0,
      "documentErrors": 0
    },
    "pages": [
      {
        "url": "https://www.checklyhq.com/",
        "webVitals": {
          "TTFB": {
            "value": 85.1000000005588,
            "score": "GOOD"
          },
          "FCP": {
            "value": 367.70000000018626,
            "score": "GOOD"
          },
          "LCP": {
            "value": 367.7,
            "score": "GOOD"
          },
          "CLS": {
            "value": 0.0049804687500000005,
            "score": "GOOD"
          },
          "TBT": {
            "value": 162,
            "score": "GOOD"
          }
        },
        "pageTimings": {
          "onContentLoad": 1143,
          "onLoad": 1632
        },
        "responseSizes": {}
      }
    ]
  },
  "assets": {
    "region": "eu-west-1",
    "imagePaths": [
      {
        "name": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202392/702961fd-7e2c-45f0-97be-1aa9eabd4d82/screenshot.jpg",
        "url": "https://s3.eu-west-1.amazonaws.com/fn-screenshots-eu-west-1-prod/cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202392/702961fd-7e2c-45f0-97be-1aa9eabd4d82/screenshot.jpg",
        "filename": "screenshot.jpg"
      }
    ],
    "logPath": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202477/702961fd-7e2c-45f0-97be-1aa9eabd4d82/out.log",
    "navigationTracePath": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202474/702961fd-7e2c-45f0-97be-1aa9eabd4d82/navigationTrace.json",
    "playwrightTestJsonReportPath": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202812/702961fd-7e2c-45f0-97be-1aa9eabd4d82/test-results.json",
    "playwrightTestTraceFiles": [
      "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202627/702961fd-7e2c-45f0-97be-1aa9eabd4d82/script-visit-page-and-take-screenshot-chromium.zip"
    ],
    "playwrightTestVideoFiles": [
      "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679655202773/702961fd-7e2c-45f0-97be-1aa9eabd4d82/visit-page-and-take-screenshot-1679655201832.webm"
    ]
  },
  "logs": [
    {
      "time": 1679655195760,
      "msg": "Starting job",
      "level": "DEBUG"
    },
    {
      "time": 1679655195760,
      "msg": "Compiling environment variables",
      "level": "DEBUG"
    },
    {
      "time": 1679655195760,
      "msg": "Creating runtime using version 2022.10",
      "level": "DEBUG"
    },
    {
      "time": 1679655195813,
      "msg": "Running Playwright test script",
      "level": "DEBUG"
    },
    {
      "time": 1679655196947,
      "msg": "Running 1 test using 1 worker",
      "level": "INFO"
    },
    {
      "time": 1679655196948,
      "msg": "",
      "level": "INFO"
    },
    {
      "time": 1679655198001,
      "msg": "[1/1] [chromium] › ../../var/task/src/2022-10/node_modules/vm2/lib/bridge.js:479:11 › visit page and take screenshot",
      "level": "INFO"
    },
    {
      "time": 1679655202269,
      "msg": "",
      "level": "INFO"
    },
    {
      "time": 1679655202270,
      "msg": "",
      "level": "INFO"
    },
    {
      "time": 1679655202270,
      "msg": "1 passed (5s)",
      "level": "INFO"
    },
    {
      "time": 1679655202283,
      "msg": "Run finished",
      "level": "DEBUG"
    },
    {
      "time": 1679655202463,
      "msg": "Uploading log file",
      "level": "DEBUG"
    }
  ],
  "scheduleError" : ''
}
