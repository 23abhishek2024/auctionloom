const { generateAuctionCopy } = require('../services/aiService');

/**
 * POST /api/ai/generate
 * Generates an optimized auction title and description from brief keywords.
 */
const generateDescription = async (req, res, next) => {
  try {
    const { keywords, category } = req.body;

    if (!keywords || typeof keywords !== 'string' || !keywords.trim()) {
      return res.status(400).json({
        error: 'Please provide item keywords to generate an auction description.',
      });
    }

    const copy = await generateAuctionCopy(keywords, category);

    res.json({
      success: true,
      title: copy.title,
      description: copy.description,
      suggested_starting_price: copy.suggested_starting_price,
      source: copy.source,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { generateDescription };
