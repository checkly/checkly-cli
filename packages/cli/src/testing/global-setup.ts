import { FixtureTemplate } from './fixture-sandbox.js'

export async function setup () {
  await FixtureTemplate.create('playwright', {
    devDependencies: { '@playwright/test': '^1.59.1' },
  })
}

export async function teardown () {
  await FixtureTemplate.destroyAll()
}
