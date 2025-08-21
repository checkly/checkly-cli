import { TcpMonitor, TcpAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check.ts' 

// TCP monitors check if a TCP connection to a given host and port can be established.
// They’re useful for monitoring databases, message queues, or any service that doesn’t use HTTP.
// Read more: https://www.checklyhq.com/docs/tcp-monitors/

new TcpMonitor('hello-tcp-1', {
  name: 'TCPbin Monitor',
  activated: true,
  group: uptimeGroup,
  maxResponseTime: 5000, // milliseconds
  degradedResponseTime: 4000,
  request: {
    hostname: 'tcpbin.com',
    port: 4242,
    data: 'ping\n', 
    ipFamily: 'IPv6',
    assertions: [
      TcpAssertionBuilder.responseData().contains('ping')
    ]
  }
})
