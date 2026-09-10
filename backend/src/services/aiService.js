/**
 * AI Auction Copywriting Service (Phase 8 - AI Assistant)
 * 
 * Powered by Google Gemini AI (gemini-3.6-flash) with standard prompt engineering.
 * Decoupled & isolated: calls Gemini API or OpenAI API if configured, or uses
 * an intelligent heuristic copywriting engine if offline.
 */

const formatPrompt = (keywords, category = 'General') => {
  return `You are an expert luxury auction appraiser and copywriter for Prime Bid.
Given the following item details:
- Keywords: "${keywords}"
- Category: "${category}"

Generate a prestigious, high-converting auction listing.
Return a valid JSON object with the following fields:
- "title": A concise, appraisal-grade auction title (under 80 characters).
- "description": A captivating, detailed 2-3 paragraph appraisal covering provenance, craftsmanship, condition, and collectibility.
- "suggested_starting_price": A realistic recommended starting bid in USD as a number (e.g. 250.00).`;
};

/**
 * Intelligent Fallback Copywriting Generator
 * Used when an external LLM API is not configured or fails.
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
 * Call Google Gemini API
 */
const callGemini = async (apiKey, keywords, category) => {
  console.log('[AIService] Calling Google Gemini API (gemini-3.6-flash)...');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(18000), // 18s timeout before fallback
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: formatPrompt(keywords, category) }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API responded with status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('No candidate content returned from Gemini.');

  const parsed = JSON.parse(rawText);
  return {
    title: parsed.title || `${keywords} — Exclusive Lot`,
    description: parsed.description,
    suggested_starting_price: parseFloat(parsed.suggested_starting_price) || 150.00,
    source: 'google_gemini_api',
  };
};

/**
 * Call OpenAI API
 */
const callOpenAI = async (apiKey, keywords, category) => {
  console.log('[AIService] Calling OpenAI API...');
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
          content: 'You are an elite auction cataloguer. Always output strict JSON matching the schema.',
        },
        {
          role: 'user',
          content: formatPrompt(keywords, category),
        },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API responded with status ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content?.trim();
  const cleanJson = rawContent.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(cleanJson);

  return {
    title: parsed.title || `${keywords} — Exclusive Lot`,
    description: parsed.description,
    suggested_starting_price: parseFloat(parsed.suggested_starting_price) || 150.00,
    source: 'openai_api',
  };
};

/**
 * Generate Auction Copy
 * @param {string} keywords - e.g. "1968 vintage rolex submariner"
 * @param {string} category - optional category
 */
const generateAuctionCopy = async (keywords, category = 'General') => {
  if (!keywords || !keywords.trim()) {
    throw new Error('Keywords are required to generate an auction description.');
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Try Google Gemini first if key exists
  if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
    try {
      return await callGemini(geminiKey, keywords, category);
    } catch (err) {
      console.warn('[AIService] Gemini API error, checking alternatives:', err.message);
    }
  }

  // 2. Try OpenAI if key exists
  if (openAiKey && openAiKey !== 'your_openai_api_key_here') {
    try {
      return await callOpenAI(openAiKey, keywords, category);
    } catch (err) {
      console.warn('[AIService] OpenAI API error, using fallback:', err.message);
    }
  }

  // 3. Fallback heuristic engine
  console.log('[AIService] Using built-in auction copy generator.');
  return generateFallbackCopy(keywords, category);
};

module.exports = { generateAuctionCopy };
