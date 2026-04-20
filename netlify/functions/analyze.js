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
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Netlify environment variables." }),
    };
  }

  try {
    const { components, connections } = JSON.parse(event.body);

    const typeLabels = {
      amp: "Amplifier", preamp: "Preamplifier", speakers: "Speakers",
      dac: "DAC", turntable: "Turntable", cartridge: "Cartridge",
      phonopre: "Phono Preamp", streamer: "Streamer", cables: "Cables", other: "Other",
    };

    const componentList = components
      .map((c) => `- [${typeLabels[c.type] || c.type}] ${c.name}`)
      .join("\n");

    const connectionList =
      connections && connections.length > 0
        ? connections.map((c) => `- ${c.fromName} → ${c.toName} via ${c.type}`).join("\n")
        : "Not specified.";

    const hasPhono = components.some((c) =>
      ["cartridge", "phonopre", "turntable"].includes(c.type)
    );

    const prompt = `You are an expert audio engineer analyzing a hi-fi audio system for compatibility.

Please look up the published specifications for each component and provide a detailed analysis.

COMPONENTS:
${componentList}

SIGNAL CHAIN CONNECTIONS:
${connectionList}

Structure your response EXACTLY as follows:

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPONENT SPECS
For each component list key published specs.

COMPATIBILITY SUMMARY
2-3 sentence overall verdict.

SIGNAL CHAIN ANALYSIS
Analyze each connection citing specific specs.${hasPhono ? `

PHONO CHAIN
Analyze cartridge compliance vs tonearm mass, gain matching, and loading impedance.` : ""}

ISSUES & RECOMMENDATIONS
Numbered list of issues and recommendations.

Be precise and reference actual published spec numbers.`;

    const requestBody = JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 2500,
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
          res.on("data", (chunk) => { data += chunk; });
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ text: parsed.content[0].text }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message || "Analysis failed" }),
    };
  }
};