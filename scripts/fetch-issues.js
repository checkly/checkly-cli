#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'checkly';
const REPO_NAME = 'checkly-cli';
const OUTPUT_FILE = path.join(__dirname, 'issues.json');

async function fetchAllIssues() {
  const allIssues = [];
  let page = 1;
  const perPage = 100;
  
  console.log('Fetching GitHub issues...');
  
  while (true) {
    try {
      const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=all&per_page=${perPage}&page=${page}`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'checkly-cli-issues-fetcher'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      const issues = await response.json();
      
      if (issues.length === 0) {
        break;
      }
      
      allIssues.push(...issues);
      console.log(`Fetched page ${page}, total issues so far: ${allIssues.length}`);
      page++;
      
      // GitHub API has a limit of 1000 items for search
      if (allIssues.length >= 1000) {
        console.log('Reached GitHub API limit of 1000 items, stopping...');
        break;
      }
      
      // Add a small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Error fetching issues:', error.message);
      console.log(`Saving ${allIssues.length} issues fetched so far...`);
      break;
    }
  }
  
  console.log(`Total issues fetched: ${allIssues.length}`);
  
  // Save to JSON file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allIssues, null, 2));
  console.log(`Issues saved to: ${OUTPUT_FILE}`);
  
  return allIssues;
}

if (require.main === module) {
  fetchAllIssues().catch(console.error);
}

module.exports = { fetchAllIssues };