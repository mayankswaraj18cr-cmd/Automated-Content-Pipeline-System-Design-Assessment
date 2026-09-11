const { google } = require('googleapis');
const createOAuth2Client = require('../config/googleAuth');

const publishToBlogger = async (article) => {
  const auth = createOAuth2Client();
  const blogger = google.blogger({ version: 'v3', auth });

  const response = await blogger.posts.insert({
    blogId: process.env.BLOGGER_BLOG_ID,
    requestBody: {
      title: article.title,
      content: article.body,
      labels: article.tags
    }
  });

  return response.data;
};

module.exports = { publishToBlogger };
