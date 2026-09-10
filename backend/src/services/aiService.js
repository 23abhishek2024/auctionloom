/**
 * AI Auction Copywriting Service (Phase 8 - AI Assistant)
 * 
 * Uses prompt engineering to craft high-converting, professional auction
 * listings. Decoupled and isolated: seamlessly uses OpenAI API if an API key
 * is provided, or uses an intelligent heuristic copywriting engine if offline.
 */

const formatPrompt = (keywords, category = 'General') => {
  return `You are an expert auction house appraiser and copywriter for Prime Bid.
Given the following item details:
- Keywords: "${keywords}"
- Category: "${category}"

Generate a captivating, high-value auction listing.
Respond ONLY with a valid JSON object matching this schema:
{
  "title": "A concise, prestigious auction title (max 80 chars)",
  "description": "A detailed 2-3 paragraph appraisal covering provenance, craftsmanship, condition, and collector value.",
  "suggested_starting_price": 150.00
}`;
};

/**
 * Intelligent Fallback Copywriting Generator
 * Used when an external LLM API is not configured or offline.
 */
const generateFallbackCopy = (keywords, category = 'General') => {
  const cleanKeywords = keywords.trim();
  const capitalized = cleanKeywords
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  const title = `${capitalized} — Authentic Collector's Edition`;

  const description = 
`Now presented for competitive auction: an outstanding example of ${capitalized}. This distinguished piece represents exceptional craftsmanship and enduring collector prestige.

The item exhibits remarkable preservation with all original markings, finishes, and structural integrity fully intact. Inspected and verified by certified appraisers, it stands as a testament to historical importance and refined design, making it an invaluable addition to any premier collection.

Offered exclusively through Prime Bid with full documentation, tamper-evident security seal, and expedited insured freight. Bidders are advised to submit early bids as competitive interest is anticipated.`;

  return {
    title,
    description,
    suggested_starting_price: 250.00,
    source: 'heuristic_engine',
  };
};

/**
 * Generate Auction Copy
 * @param {string} keywords - e.g. "1968 vintage rolex submariner"
 * @param {string} category - optional category
 * @returns {Promise<{ title: string, description: string, suggested_starting_price: number }>}
 */
const generateAuctionCopy = async (keywords, category = 'General') => {
  if (!keywords || !keywords.trim()) {
    throw new Error('Keywords are required to generate an auction description.');
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    console.log('[AIService] No OPENAI_API_KEY detected. Using intelligent fallback copywriter.');
    return generateFallbackCopy(keywords, category);
  }

  try {
    console.log('[AIService] Calling LLM API with prompt engineering...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an elite auction cataloguer. Always output strict JSON without markdown code fences.',
          },
          {
            role: 'user',
            content: formatPrompt(keywords, category),
          },
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`[AIService] LLM API responded with ${response.status}:`, errBody);
      return generateFallbackCopy(keywords, category);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim();

    // Clean JSON markdown block if returned
    const cleanJson = rawContent
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    const parsed = JSON.parse(cleanJson);
    return {
      title: parsed.title || `${keywords} (Exclusive Lot)`,
      description: parsed.description,
      suggested_starting_price: parseFloat(parsed.suggested_starting_price) || 100.0,
      source: 'llm_api',
    };
  } catch (err) {
    console.error('[AIService] LLM API failed, falling back gracefully:', err.message);
    return generateFallbackCopy(keywords, category);
  }
};

module.exports = { generateAuctionCopy };
