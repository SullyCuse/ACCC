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

    const prompt = `You are an expert audio engineer and audiophile consultant. A user wants a compatibility analysis of their hi-fi audio system.

Please look up the published specifications for each component from manufacturer data and well-known audio sources, then use those actual specs to perform a thorough analysis. IMPORTANT: The user has already classified each component by type — treat their classification as authoritative. Do NOT re-classify components (e.g. do not call an Amplifier a passive device, or a CD Player a streamer). Use the manufacturer's published specs for the exact model name provided.

COMPONENTS:
${componentList}

SIGNAL CHAIN CONNECTIONS:
${connectionList}

Structure your response EXACTLY as follows (use these exact section headers):

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPONENT SPECS
List each component on its own, with its name as a bold header followed by bullet-point specs. Use EXACTLY this format for every component — no extra text between components, no summary paragraphs mixed in:

**[Component Name] ([Type])**
- Spec name: value
- Spec name: value
- Spec name: value

Include only the specs relevant to that component type (power output, impedance, sensitivity, gain, output voltage, cartridge compliance, tonearm effective mass, etc.). One component block per component, nothing else in this section.

COMPATIBILITY SUMMARY
[2-3 sentences summarizing the overall compatibility verdict]

SIGNAL CHAIN ANALYSIS
[Go connection by connection through the chain, assessing how well each pairing works using actual specs. Note whether the connection type is appropriate and cite specific numbers.]${
      hasPhono ? `

PHONO CHAIN
[Dedicated analysis of the phono chain: cartridge type (MM/MC), compliance vs tonearm effective mass and resonant frequency calculation, gain matching, loading impedance recommendation, and capacitance if relevant.]` : ""
    }

ISSUES & RECOMMENDATIONS
[Numbered list of specific issues and actionable recommendations with exact settings where relevant]

Be precise and technical. Reference specific published spec numbers throughout. Prioritize completing ALL sections.`;

    const requestBody = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
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
