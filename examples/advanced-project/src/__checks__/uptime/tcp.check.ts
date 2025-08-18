import { TcpMonitor, TcpAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check.ts' 
// TCP Monitors are similar to API monitors, for endpoints that don't accept
// HTTP requests. Unlike URL monitors, TCP monitors can make assertions based
// on response time and the content of the response. 
// Further documentation: https://www.checklyhq.com/docs/tcp-monitors/

new TcpMonitor('hello-tcp-1', {
  name: 'TCPbin Monitor',
  activated: true,
  group: uptimeGroup,
  maxResponseTime: 5000,
  degradedResponseTime: 4000,
  request: {
    hostname: 'tcpbin.com',
    port: 4242,
    data: 'ping\n',
    ipFamily: 'IPv6',
    assertions: [
        TcpAssertionBuilder.responseTime().lessThan(1000),
        TcpAssertionBuilder.responseData().contains('ping')
    ]
  }
})