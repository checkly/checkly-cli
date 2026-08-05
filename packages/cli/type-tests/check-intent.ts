import type {
  AgenticCheckProps,
  ApiCheckProps,
  BrowserCheckProps,
  CheckIntent,
  DnsMonitorProps,
  GrpcMonitorProps,
  HeartbeatMonitorProps,
  IcmpMonitorProps,
  MultiStepCheckProps,
  PlaywrightCheckProps,
  SslMonitorProps,
  TcpMonitorProps,
  TracerouteMonitorProps,
  UrlMonitorProps,
} from '../src/constructs/index.js'

type HasIntent<Props> = 'intent' extends keyof Props ? true : false

type IntentExposure = {
  api: HasIntent<ApiCheckProps>
  browser: HasIntent<BrowserCheckProps>
  multiStep: HasIntent<MultiStepCheckProps>
  url: HasIntent<UrlMonitorProps>
  dns: HasIntent<DnsMonitorProps>
  icmp: HasIntent<IcmpMonitorProps>
  tcp: HasIntent<TcpMonitorProps>
  grpc: HasIntent<GrpcMonitorProps>
  playwright: HasIntent<PlaywrightCheckProps>
  agentic: HasIntent<AgenticCheckProps>
  heartbeat: HasIntent<HeartbeatMonitorProps>
  ssl: HasIntent<SslMonitorProps>
  traceroute: HasIntent<TracerouteMonitorProps>
}

export const intentExposure: IntentExposure = {
  api: true,
  browser: true,
  multiStep: true,
  url: true,
  dns: true,
  icmp: true,
  tcp: true,
  grpc: true,
  playwright: true,
  agentic: false,
  heartbeat: false,
  ssl: false,
  traceroute: false,
}

export const goalOnlyIntent: CheckIntent = {
  goal: 'Verify that authenticated users can open the dashboard.',
}
