import {Hook} from '@oclif/core'
import * as chalk from 'chalk'

const hook: Hook<'init'> = async function (options) {
  console.log(
    `${chalk.bold.yellow('> The Checkly CLI has moved to a new package name')}: https://www.npmjs.com/package/checkly.` +
    chalk.dim(`
> To upgrade to the latest version and receive the latest features and fixes, run:
>
>    npm uninstall --save @checkly/cli && npm install --save-dev checkly@latest
>
> Additionally, any imports of '@checkly/cli' should be updated. For example,
>
>   import { ApiCheck, AssertionBuilder } from '@checkly/cli/constructs'  
>
> should be replaced by
>
>    import { ApiCheck, AssertionBuilder } from 'checkly/constructs' 
>
> After migrating you can continue to code, test, and deploy synthetic monitoring at scale.
`))
}

export default hook
