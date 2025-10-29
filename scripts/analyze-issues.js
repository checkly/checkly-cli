#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ISSUES_FILE = path.join(__dirname, 'issues.json');

function loadIssues() {
  if (!fs.existsSync(ISSUES_FILE)) {
    console.error(`Issues file not found: ${ISSUES_FILE}`);
    console.log('Run fetch-issues.js first to download the issues data.');
    process.exit(1);
  }
  
  const data = fs.readFileSync(ISSUES_FILE, 'utf8');
  return JSON.parse(data);
}

function analyzeIssuesByMonth(issues) {
  const monthlyStats = {};
  const currentYear = new Date().getFullYear();
  
  issues.forEach(issue => {
    const createdDate = new Date(issue.created_at);
    const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        total: 0,
        open: 0,
        closed: 0,
        pullRequests: 0,
        issues: 0
      };
    }
    
    monthlyStats[monthKey].total++;
    
    if (issue.state === 'open') {
      monthlyStats[monthKey].open++;
    } else {
      monthlyStats[monthKey].closed++;
    }
    
    if (issue.pull_request) {
      monthlyStats[monthKey].pullRequests++;
    } else {
      monthlyStats[monthKey].issues++;
    }
  });
  
  return monthlyStats;
}

function displayTable(monthlyStats) {
  console.log('\n📊 GitHub Issues Analysis by Month\n');
  console.log('┌─────────────┬───────┬──────┬────────┬─────┬──────────────┐');
  console.log('│    Month    │ Total │ Open │ Closed │ PRs │ Issues Only  │');
  console.log('├─────────────┼───────┼──────┼────────┼─────┼──────────────┤');
  
  // Sort months chronologically
  const sortedMonths = Object.keys(monthlyStats).sort();
  
  sortedMonths.forEach(month => {
    const stats = monthlyStats[month];
    console.log(`│ ${month.padEnd(11)} │ ${String(stats.total).padStart(5)} │ ${String(stats.open).padStart(4)} │ ${String(stats.closed).padStart(6)} │ ${String(stats.pullRequests).padStart(3)} │ ${String(stats.issues).padStart(12)} │`);
  });
  
  console.log('└─────────────┴───────┴──────┴────────┴─────┴──────────────┘');
}

function displaySummary(issues, monthlyStats) {
  const totalIssues = issues.filter(issue => !issue.pull_request).length;
  const totalPRs = issues.filter(issue => issue.pull_request).length;
  const openIssues = issues.filter(issue => issue.state === 'open' && !issue.pull_request).length;
  const openPRs = issues.filter(issue => issue.state === 'open' && issue.pull_request).length;
  
  console.log('\n📈 Summary Statistics');
  console.log('─────────────────────');
  console.log(`Total Items Analyzed: ${issues.length}`);
  console.log(`Issues: ${totalIssues} (${openIssues} open)`);
  console.log(`Pull Requests: ${totalPRs} (${openPRs} open)`);
  console.log(`Months with Activity: ${Object.keys(monthlyStats).length}`);
  
  // Find most active month
  const mostActiveMonth = Object.entries(monthlyStats)
    .sort(([,a], [,b]) => b.total - a.total)[0];
  
  if (mostActiveMonth) {
    console.log(`Most Active Month: ${mostActiveMonth[0]} (${mostActiveMonth[1].total} items)`);
  }
}

function main() {
  try {
    console.log('Loading issues data...');
    const issues = loadIssues();
    console.log(`Loaded ${issues.length} issues`);
    
    const monthlyStats = analyzeIssuesByMonth(issues);
    
    displayTable(monthlyStats);
    displaySummary(issues, monthlyStats);
    
  } catch (error) {
    console.error('Error analyzing issues:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeIssuesByMonth, loadIssues };