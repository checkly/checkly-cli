import { execa } from '@esm2cjs/execa'
import * as passwdUser from 'passwd-user'

const environmentVariables = [
  'GIT_AUTHOR_NAME',
  'GIT_COMMITTER_NAME',
  'HGUSER', // Mercurial
  'C9_USER', // Cloud9
]

function checkEnv () {
  const { env } = process
  const variableName = environmentVariables.find((variable) => env[variable])
  const fullName = variableName && env[variableName]

  if (!fullName) {
    throw new Error()
  }

  return fullName
}

async function checkPasswd () {
  const user = await passwdUser()

  if (!user?.fullName) {
    throw new Error()
  }

  return user.fullName
}

async function checkGit () {
  const fullName = await execa('git', ['config', '--global', 'user.name'])

  if (!fullName?.stdout) {
    throw new Error()
  }

  return fullName.stdout
}

async function checkOsaScript () {
  const fullName = await execa('osascript', ['-e', 'long user name of (system info)'])

  if (!fullName?.stdout) {
    throw new Error()
  }

  return fullName.stdout
}

async function checkWmic () {
  const stdout = await execa('wmic', [
    'useraccount',
    'where',
    `name="${process.env.USERNAME}"`,
    'get',
    'fullname',
  ])

  const fullName = stdout.stdout.replace('FullName', '').trim()

  if (!fullName) {
    throw new Error()
  }

  return fullName
}

async function checkGetEnt () {
  const result = await execa('getent', ['passwd', '$(whoami)'])
  const fullName = (result.stdout.split(':')[4] || '').replace(/,.*/, '')

  if (!fullName) {
    throw new Error()
  }

  return fullName
}

function fallback () {
  if (process.platform === 'darwin') {
    return Promise.any([checkPasswd(), checkOsaScript()])
  }

  if (process.platform === 'win32') {
    // The full name is usually not set by default in the system on Windows 7+
    return Promise.any([checkGit(), checkWmic()])
  }

  return Promise.any([checkPasswd(), checkGetEnt(), checkGit()])
}

export async function getFullName () {
  try {
    return await checkEnv()
  } catch {}

  try {
    return await fallback()
  } catch {}
}
