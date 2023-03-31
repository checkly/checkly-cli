export const apiCheckResult = {
  "logicalId": "test-api-check-1",
  "sourceFile": "src/some-other-folder/api.check.ts",
  "id": "b66b7047-5e8d-4e37-b822-ef472dca9f75",
  "sourceInfo": {
    "checkRunId": "4f20dfa7-8c66-4a15-8c43-5dc24f6206c6",
    "checkRunSuiteId": "6390a87e-89c7-4295-b6f8-b23e87922ef3",
    "ephemeral": true
  },
  "checkRunId": "1c0be612-a5ec-432e-ac1c-837d2f70c010",
  "name": "Test API check",
  "hasErrors": false,
  "hasFailures": false,
  "isDegraded": false,
  "overMaxResponseTime": false,
  "attempts": 1,
  "aborted": false,
  "runLocation": "eu-west-1",
  "startedAt": "2023-03-24T10:45:40.907Z",
  "stoppedAt": "2023-03-24T10:45:42.141Z",
  "responseTime": 1234,
  "logFile": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679654744470/1c0be612-a5ec-432e-ac1c-837d2f70c010/out.log",
  "metadata": {
    "assertionsSummary": {
      "success": 1,
      "failure": 0
    },
    "statusCode": 200,
    "timingPhases": {
      "wait": 1.0113450000062585,
      "dns": 17.97417699988,
      "tcp": 69.05959099996835,
      "firstByte": 1145.8882680002134,
      "download": 0.2760220000054687,
      "total": 1234.2094030000735
    },
    "statusText": "OK",
    "requestError": null
  },
  "checkType": "API",
  "assets": {
    "region": "eu-west-1",
    "checkRunDataPath": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679654744587/1c0be612-a5ec-432e-ac1c-837d2f70c010/check-run-data.json",
    "logPath": "cdbdf63f-cce6-4464-823a-5e59aadee640/ad-hoc-1679654744470/1c0be612-a5ec-432e-ac1c-837d2f70c010/out.log"
  },
  "logs": {
    "setup": [
      {
        "time": 1679654740806,
        "msg": "*** START setup/teardown script runner with runtime version 2022.10",
        "level": "DEBUG"
      },
      {
        "time": 1679654740845,
        "msg": "check SETUP",
        "level": "INFO"
      },
      {
        "time": 1679654740845,
        "msg": "*** END: Duration 0 s, 38.538 ms",
        "level": "DEBUG"
      }
    ],
    "request": [],
    "teardown": [
      {
        "time": 1679654744386,
        "msg": "*** START setup/teardown script runner with runtime version 2022.10",
        "level": "DEBUG"
      },
      {
        "time": 1679654744425,
        "msg": "check TEARDOWN",
        "level": "INFO"
      },
      {
        "time": 1679654744425,
        "msg": "*** END: Duration 0 s, 38.841 ms",
        "level": "DEBUG"
      }
    ]
  },
  "checkRunData": {
    "assertions": [
      {
        "source": "STATUS_CODE",
        "comparison": "EQUALS",
        "property": "",
        "target": 200,
        "regex": null
      }
    ],
    "request": {
      "method": "POST",
      "url": "https://httpbin.org/post",
      "data": "{\"data\":1}",
      "params": {},
      "headers": {
        "User-Agent": "Checkly/1.0 (https://www.checklyhq.com)",
        "accept-encoding": "gzip, deflate",
        "content-length": 10
      }
    },
    "response": {
      "status": 200,
      "statusText": "OK",
      "body": "{\n  \"args\": {}, \n  \"data\": \"{\\\"data\\\":1}\", \n  \"files\": {}, \n  \"form\": {}, \n  \"headers\": {\n    \"Accept-Encoding\": \"gzip, deflate\", \n    \"Content-Length\": \"10\", \n    \"Host\": \"httpbin.org\", \n    \"User-Agent\": \"Checkly/1.0 (https://www.checklyhq.com)\", \n    \"X-Amzn-Trace-Id\": \"Root=1-641d7f55-0b99ca310b7322250bd32d00\"\n  }, \n  \"json\": {\n    \"data\": 1\n  }, \n  \"origin\": \"3.251.180.115\", \n  \"url\": \"https://httpbin.org/post\"\n}\n",
      "href": "https://httpbin.org/post",
      "truncated": false,
      "headers": {
        "date": "Fri, 24 Mar 2023 10:45:42 GMT",
        "content-type": "application/json",
        "content-length": "422",
        "connection": "close",
        "server": "gunicorn/19.9.0",
        "access-control-allow-origin": "*",
        "access-control-allow-credentials": "true"
      },
      "timings": {
        "socket": 1.0113450000062585,
        "lookup": 18.98552199988626,
        "connect": 88.04511299985461,
        "response": 1233.933381000068,
        "end": 1234.2094030000735
      },
      "timingPhases": {
        "wait": 1.0113450000062585,
        "dns": 17.97417699988,
        "tcp": 69.05959099996835,
        "firstByte": 1145.8882680002134,
        "download": 0.2760220000054687,
        "total": 1234.2094030000735
      }
    },
    "requestError": null,
  },
  "scheduleError" : ""
}
