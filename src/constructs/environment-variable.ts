export interface EnvironmentVariableProps {
  key: string
  value: string
  locked: boolean
}

export class EnvironmentVariable {
  key: string
  value: string
  locked: boolean
  constructor (props: EnvironmentVariableProps) {
    this.key = props.key
    this.value = props.value
    this.locked = props.locked
  }
}
