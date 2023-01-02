import KeyValuePair from './key-value-pair'
export type EnvironmentVariableProps = KeyValuePair

export class EnvironmentVariable {
  key: string
  value: string
  locked: boolean
  constructor (props: EnvironmentVariableProps) {
    this.key = props.key
    this.value = props.value
    this.locked = props.locked || false
  }
}
