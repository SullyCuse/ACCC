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

    const prompt = `You are an expert audio engineer. Analyze this hi-fi system for compatibility. Use your training knowledge — always provide specs and analysis, never refuse. If uncertain about a specific model's exact specs, use reasonable estimates based on the manufacturer's product line. Keep each section brief but complete.

Components (user-classified — do not re-classify):
${componentList}

Connections:
${connectionList}

Respond in EXACTLY this format:

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPONENT SPECS
**[Name] ([Type])**
- spec: value
(one block per component, specs only, no other text)

COMPATIBILITY SUMMARY
[2-3 sentences]

SIGNAL CHAIN ANALYSIS
[Key connection assessments with numbers, 4-6 bullet points]${
      hasPhono ? `

PHONO CHAIN
[Resonance freq = 159/√(mass×compliance) Hz, gain, loading — 3-4 bullets]` : ""
    }

ISSUES & RECOMMENDATIONS
[Top 4-5 numbered recommendations with specific settings]`;

    const requestBody = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
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
