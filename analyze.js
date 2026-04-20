const Anthropic = require("@anthropic-ai/sdk");

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
        error:
          "ANTHROPIC_API_KEY environment variable not set. Add it in Netlify Site Settings → Environment Variables.",
      }),
    };
  }

  try {
    const { components, connections } = JSON.parse(event.body);

    if (!components || components.length < 2) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "At least two components are required." }),
      };
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const typeLabels = {
      amp: "Amplifier",
      preamp: "Preamplifier",
      speakers: "Speakers",
      dac: "DAC",
      turntable: "Turntable",
      cartridge: "Cartridge",
      phonopre: "Phono Preamp",
      streamer: "Streamer",
      cables: "Cables",
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
      ["cartridge", "phonopre", "turntable"].includes(c.type)
    );

    const prompt = `You are an expert audio engineer and audiophile consultant. A user wants a compatibility analysis of their hi-fi audio system.

Please look up the published specifications for each component from manufacturer data and well-known audio sources, then use those actual specs to perform a thorough analysis.

COMPONENTS:
${componentList}

SIGNAL CHAIN CONNECTIONS:
${connectionList}

Structure your response EXACTLY as follows (use these exact section headers):

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPONENT SPECS
For each component, list the key published specs you found (power output, impedance, sensitivity, gain, output voltage, cartridge compliance, etc. as relevant to that component type). Format each component as:
**[Component Name]**
- Spec: value
- Spec: value

COMPATIBILITY SUMMARY
[2-3 sentences summarizing the overall compatibility verdict]

SIGNAL CHAIN ANALYSIS
[Go connection by connection through the chain, assessing how well each pairing works using actual specs. Note whether the connection type is appropriate and cite specific numbers.]${
      hasPhono
        ? `

PHONO CHAIN
[Dedicated analysis of the phono chain: cartridge type (MM/MC), compliance vs tonearm effective mass and resonant frequency calculation, gain matching, loading impedance recommendation, and capacitance if relevant.]`
        : ""
    }

ISSUES & RECOMMENDATIONS
[Numbered list of specific issues and actionable recommendations with exact settings where relevant]

Be precise, technical, and always reference specific published spec numbers. If specs cannot be found for a component, state that and reason from what is known.`;

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ text: message.content[0].text }),
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
