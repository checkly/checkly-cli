# Checkly Test Session Summary
Ran **5** checks in **us-east-1**.
|Result|Name|Check Type|Filename|Duration|
|:-|:-|:-|:-|:-|
|✅ Pass|homepage.test.ts|BROWSER|`src/__checks__/group.check.ts`|5s |
|✅ Pass|Skip SSL Check|API|`src/services/api/api.check.ts`|321ms |
|✅ Pass|Show SECRET_ENV value|BROWSER|`src/__checks__/secret.check.ts`|327ms |
|✅ Pass|Public Stats|API|`src/services/api/api.check.ts`|97ms |
|✅ Pass|Check with group|BROWSER|`src/__checks__/group.check.ts`|329ms |
> Tip: use `--record` to get a full test session overview with traces, videos and logs, e.g. `npx checkly test --reporter=github --record`