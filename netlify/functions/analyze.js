const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "ANTHROPIC_API_KEY not set. Add it in Netlify Site Settings → Environment Variables.",
      }),
    };
  }

  try {
    const { components, connections } = JSON.parse(event.body);

    if (!components || components.length < 2) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "At least two components are required." }),
      };
    }

    const typeLabels = {
      amp: "Amplifier",
      preamp: "Preamplifier",
      speakers: "Speakers",
      dac: "DAC",
      turntable: "Turntable",
      tonearm: "Tonearm",
      cartridge: "Cartridge",
      phonopre: "Phono Preamp",
      streamer: "Streamer",
      cdplayer: "CD Player",
      cables: "Cables",
      headphones: "Headphones",
      other: "Other",
    };

    const componentList = components
      .map((c) => `- [${typeLabels[c.type] || c.type}] ${c.name}`)
      .join("\n");

    const connectionList =
      connections && connections.length > 0
        ? connections.map((c) => `- ${c.fromName} → ${c.toName} via ${c.type}`).join("\n")
        : "Not specified — infer likely connections from component types.";

    const hasPhono = components.some((c) =>
      ["cartridge", "phonopre", "turntable", "tonearm"].includes(c.type)
    );

    const prompt = `You are an expert audio engineer and audiophile consultant with deep knowledge of hi-fi audio equipment. You have extensive training knowledge of amplifiers, preamplifiers, DACs, streamers, turntables, phono stages, and other audio components from hundreds of manufacturers.

CRITICAL INSTRUCTION: You MUST complete this analysis in full. Never refuse, never say you cannot proceed, never claim you cannot find specifications. Use your training knowledge — if you know the component well, cite its specs precisely. If you are less certain about a specific model's exact figures, provide your best estimates based on the manufacturer's product line and typical specs for that component category. Always provide numbers. Always complete every section.

The user has classified each component — treat their classification as authoritative. Do NOT re-classify.

COMPONENTS:
${componentList}

SIGNAL CHAIN CONNECTIONS:
${connectionList}

Respond EXACTLY in this format:

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPONENT SPECS
**[Component Name] ([Type])**
- Spec: value
- Spec: value

(One block per component, relevant specs only, no other text in this section)

COMPATIBILITY SUMMARY
[2-3 sentences on overall verdict]

SIGNAL CHAIN ANALYSIS
[Connection-by-connection assessment citing specific numbers]${
      hasPhono ? `

PHONO CHAIN
[Cartridge type, compliance × tonearm mass resonance freq = 159/√(m×c) Hz, gain matching, loading recommendation]` : ""
    }

ISSUES & RECOMMENDATIONS
[Numbered list of specific actionable recommendations with exact settings]`;

    const requestBody = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Length": Buffer.byteLength(requestBody),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        }
      );
      req.on("error", reject);
      req.write(requestBody);
      req.end();
    });

    const parsed = JSON.parse(responseText);

    if (parsed.error) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: parsed.error.message || "API error" }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ text: parsed.content[0].text }),
    };
  } catch (error) {
    console.error("Analysis error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message || "Analysis failed" }),
    };
  }
};
