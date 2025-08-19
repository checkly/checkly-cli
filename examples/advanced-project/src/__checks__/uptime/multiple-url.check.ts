//sitemapMonitors.check.ts
//In this bulk monitoring example we'll monitor 50 URLs from one file
//this will create URL monitors in your Checkly dashboard

import { Frequency, UrlMonitor, UrlAssertionBuilder } from 'checkly/constructs'

//grepped a sitemap.xml file for an array of URLs
const sitemapUrls = [
    'https://docs.anthropic.com/de/api/admin-api/workspace_members/get-workspace-member',
    'https://docs.anthropic.com/de/api/admin-api/workspace_members/list-workspace-members'
]

//create paths and friendly names for each monitor
sitemapUrls.forEach((url, index) => {
  const urlPath = new URL(url).pathname.replace(/\//g, '-').replace(/^-+|-+$/g, '') || 'root'
  const monitorId = `checkly-${urlPath}-1`
  const monitorName = `${urlPath.replace(/-/g, ' ')} url monitor`

//create each monitor
  new UrlMonitor(monitorId, {
    name: monitorName,
    activated: true,
    request: {
      url: url,
      skipSSL: false,
      followRedirects: true,
      assertions: [
        UrlAssertionBuilder.statusCode().equals(200),
      ]
    }
  })
})