The Checkly CLI has moved from `@checkly/cli` to a new package name: [checkly](https://www.npmjs.com/package/checkly). Please migrate to the new package to have access to the latest features and fixes.

If you're already using the old package `@checkly/cli` in a project, you can migrate by running the following command:
```
npm uninstall --save @checkly/cli && npm install --save-dev checkly@latest  
```

Additionally, any imports of `@checkly/cli` should be updated. For example,
```
import { ApiCheck, AssertionBuilder } from '@checkly/cli/constructs'  
```

should be replaced by
```
import { ApiCheck, AssertionBuilder } from 'checkly/constructs' 
```

After migrating, you can continue to **code, test, and deploy synthetic monitoring at scale**.