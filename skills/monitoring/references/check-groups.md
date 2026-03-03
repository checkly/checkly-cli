# Check Groups

- Import the `CheckGroupV2` construct from `checkly/constructs`.
- Check Groups are used to group checks together for easier management and organization.
- Checks are added to Check Groups by referencing the group in the `group` property of a check.

**Reference:** https://www.checklyhq.com/docs/constructs/check-group/

```typescript
import { CheckGroupV2 } from 'checkly/constructs'

export const exampleGroup = new CheckGroupV2('example-group', {
  name: 'Example Group',
})
```
