const { GoogleGenerativeAI } = require('@google/generative-ai');
const Article = require('../models/Article');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateArticle = async () => {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Fetch existing titles to enforce topic uniqueness
  const existingArticles = await Article.find({}, 'title').lean();
  const existingTitles = existingArticles.map(a => a.title);

  const prompt = `
    You are an expert financial market analyst for GODSTOCKSS.
    Generate a high-quality article about stock market trends, trading strategies, or financial intelligence.
    
    CRITICAL: Avoid generating content similar to these existing titles:
    ${JSON.stringify(existingTitles)}

    Return ONLY a JSON object strictly matching this schema:
    {
      "title": "Unique Article Title",
      "body": "HTML formatted article body content (use <p>, <h3>, <ul>, etc.)",
      "tags": ["StockMarket", "Finance", "GODSTOCKSS"]
    }
  `;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  });

  const content = JSON.parse(result.response.text());

  // Prevent insertion if duplicate title slipped past prompt constraint
  const isDuplicate = await Article.exists({ title: content.title });
  if (isDuplicate) {
    throw new Error(`Duplicate article title generated: "${content.title}"`);
  }

  const newArticle = await Article.create({
    title: content.title,
    body: content.body,
    tags: content.tags,
    status: 'PENDING'
  });

  console.log(`[AI Service] Created new PENDING article: "${newArticle.title}"`);
  return newArticle;
};

module.exports = { generateArticle };
