// Only a type import reaches this file. A bundle that follows it fails on the
// missing component below, like an app type that pulls in UI code.
import { Component } from './Component.vue'

export type Plan = { name: string, component: typeof Component }
export type Account = Plan
