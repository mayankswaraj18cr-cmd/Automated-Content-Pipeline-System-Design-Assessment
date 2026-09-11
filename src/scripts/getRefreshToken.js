const http = require('http');
const url = require('url');
const { google } = require('googleapis');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/blogger'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES
});

console.log('Authorize this app by visiting this URL:\n', authUrl);

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const q = url.parse(req.url, true).query;
    const { tokens } = await oauth2Client.getToken(q.code);
    res.end('Authentication successful! Check your terminal for the Refresh Token.');
    console.log('\n--- YOUR REFRESH TOKEN ---');
    console.log(tokens.refresh_token);
    console.log('---------------------------\nSave this token to your .env file as GOOGLE_REFRESH_TOKEN');
    server.close();
    process.exit(0);
  }
}).listen(3000);
