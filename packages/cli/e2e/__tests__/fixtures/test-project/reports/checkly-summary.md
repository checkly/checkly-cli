# Checkly Test Session Summary
Ran **5** checks in **us-east-1**.
|Result|Name|Check Type|Filename|Duration|
|:-|:-|:-|:-|:-|
|✅ Pass|homepage.test.ts|BROWSER|`src/__checks__/group.check.ts`|6s |
|✅ Pass|Skip SSL Check|API|`src/services/api/api.check.ts`|334ms |
|✅ Pass|Show SECRET_ENV value|BROWSER|`src/__checks__/secret.check.ts`|308ms |
|✅ Pass|Public Stats|API|`src/services/api/api.check.ts`|119ms |
|✅ Pass|Check with group|BROWSER|`src/__checks__/group.check.ts`|328ms |
> Tip: use `--record` to get a full test session overview with traces, videos and logs, e.g. `npx checkly test --reporter=github --record`