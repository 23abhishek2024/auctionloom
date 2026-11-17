const { generateAuctionCopy } = require('../services/aiService');
const { optionalString } = require('../utils/validators');

/**
 * POST /api/ai/generate
 * Generates an optimized auction title and description from brief keywords.
 */
const generateDescription = async (req, res, next) => {
  try {
    const { keywords } = req.body;

    if (!keywords || typeof keywords !== 'string' || !keywords.trim()) {
      return res.status(400).json({
        error: 'Please provide item keywords to generate an auction description.',
      });
    }
    if (keywords.trim().length > 200) {
      return res.status(400).json({ error: 'Keywords must be at most 200 characters.' });
    }
    const category = optionalString(req.body.category, 'Category', 50) || 'General';

    const copy = await generateAuctionCopy(keywords.trim(), category);

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
